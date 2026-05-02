import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Alert, Image,
  ActivityIndicator, Linking, Dimensions
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getReports, addReport, deleteReport, parseAndSaveLabValues } from '../storage';

const { width } = Dimensions.get('window');
const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const RED     = '#EF4444';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

const GOOGLE_VISION_API_KEY = 'AIzaSyDjS8w_l5XEgy6slSOmVxXwzZ14PjDcWbI';
const AI_SERVICE_URL        = 'http://192.168.1.54:8000';
const USE_AI_SERVICE        = true;

const CATEGORIES = ['All', 'Blood', 'Urine', 'Imaging', 'Pathology', 'Other'];

// ── OCR ───────────────────────────────────────────────────────────────────────
async function runOCR(base64Image) {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: base64Image }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }]
        })
      }
    );
    const data = await response.json();
    return data.responses?.[0]?.fullTextAnnotation?.text || '';
  } catch { return ''; }
}

function parseReportText(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const labKeywords = ['diagnostics','laboratory','lab','pathology','thyrocare','srl','metropolis','dr lal','vijaya','apollo','fortis'];
  let lab = 'Unknown Lab';
  for (const line of lines) {
    if (labKeywords.some(k => line.toLowerCase().includes(k))) { lab = line.trim(); break; }
  }
  const reportKeywords = ['blood','urine','thyroid','glucose','cholesterol','haemoglobin','hemoglobin','cbc','hba1c','tsh','lipid','creatinine','platelet','complete'];
  let name = 'Lab Report', category = 'Other';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (reportKeywords.some(k => lower.includes(k))) {
      name = line.trim();
      if (lower.includes('urine'))                                                          category = 'Urine';
      else if (lower.includes('xray') || lower.includes('mri') || lower.includes('scan'))  category = 'Imaging';
      else                                                                                   category = 'Blood';
      break;
    }
  }
  return { name, lab, category };
}

function detectCategory(testName) {
  if (!testName) return 'Other';
  const lower = testName.toLowerCase();
  if (lower.includes('urine'))                                                         return 'Urine';
  if (lower.includes('xray') || lower.includes('mri') || lower.includes('scan'))      return 'Imaging';
  return 'Blood';
}

// ── Parsed Values Display ─────────────────────────────────────────────────────
function ParsedValuesCard({ values }) {
  if (!values || Object.keys(values).length === 0) return null;
  const labels = {
    hba1c: 'HbA1c', glucose: 'Fasting Glucose', hb: 'Haemoglobin',
    tsh: 'TSH', cholesterol: 'Total Cholesterol', ldl: 'LDL',
    hdl: 'HDL', triglycerides: 'Triglycerides', creatinine: 'Creatinine',
  };
  return (
    <View style={pv.card}>
      <Text style={pv.title}>📊 Values extracted → saved to Timeline</Text>
      <View style={pv.grid}>
        {Object.entries(values).map(([id, val]) => (
          <View key={id} style={pv.item}>
            <Text style={pv.label}>{labels[id] || id}</Text>
            <Text style={pv.value}>{val}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Report Viewer ─────────────────────────────────────────────────────────────
function ReportViewer({ report, visible, onClose, onDelete }) {
  if (!report) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={v.overlay}>
        <View style={v.sheet}>
          <View style={v.header}>
            <View style={{ flex: 1 }}>
              <Text style={v.title}>{report.name}</Text>
              <Text style={v.sub}>{report.lab}  ·  {report.date}</Text>
            </View>
            <TouchableOpacity style={v.closeBtn} onPress={onClose}>
              <Text style={v.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {report.image && report.type === 'image' && (
              <Image source={{ uri: report.image }} style={v.reportImage} resizeMode="contain" />
            )}
            {report.type === 'pdf' && (
              <View style={v.pdfBox}>
                <Text style={v.pdfEmoji}>📄</Text>
                <Text style={v.pdfName}>{report.fileName || report.name}</Text>
                <TouchableOpacity style={v.openPdfBtn} onPress={async () => {
                  if (report.image) {
                    const ok = await Sharing.isAvailableAsync();
                    if (ok) await Sharing.shareAsync(report.image, { mimeType: 'application/pdf' });
                  }
                }}>
                  <Text style={v.openPdfBtnText}>Open PDF ↗</Text>
                </TouchableOpacity>
              </View>
            )}
            {!report.image && (
              <View style={v.noImageBox}>
                <Text style={v.noImageEmoji}>🧪</Text>
                <Text style={v.noImageText}>No image attached</Text>
              </View>
            )}

            {/* Parsed values */}
            {report.parsedValues && <ParsedValuesCard values={report.parsedValues} />}

            <View style={v.detailsCard}>
              <Text style={v.detailsTitle}>Report Details</Text>
              {[
                { label: 'Report Name', value: report.name },
                { label: 'Lab',         value: report.lab },
                { label: 'Date',        value: report.date },
                { label: 'Category',    value: report.category },
                { label: 'Status',      value: report.status === 'abnormal' ? '⚠ Needs Review' : '✓ Normal' },
              ].map((item, i) => (
                <View key={i} style={v.detailRow}>
                  <Text style={v.detailLabel}>{item.label}</Text>
                  <Text style={v.detailValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={v.actions}>
              <TouchableOpacity style={v.shareBtn} onPress={async () => {
                if (report.image) {
                  const ok = await Sharing.isAvailableAsync();
                  if (ok) await Sharing.shareAsync(report.image, {
                    mimeType: report.type === 'pdf' ? 'application/pdf' : 'image/jpeg',
                    dialogTitle: `Share ${report.name}`,
                  });
                } else {
                  const msg = `🏥 *${report.name}*\n📍 Lab: ${report.lab}\n📅 Date: ${report.date}`;
                  await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
                }
              }}>
                <Text style={v.shareBtnText}>💬 Share on WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={v.deleteBtn} onPress={() => {
                Alert.alert('Delete Report', `Delete "${report.name}"?`, [
                  { text: 'Cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { onDelete(report.id); onClose(); } }
                ]);
              }}>
                <Text style={v.deleteBtnText}>🗑️ Delete Report</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Category Pill ─────────────────────────────────────────────────────────────
function CategoryPill({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.pill, active && s.pillActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.pillText, active && s.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Report Card ───────────────────────────────────────────────────────────────
function ReportCard({ report, onPress, onDelete }) {
  const catColors = { Blood: TEAL, Urine: GREEN, Imaging: '#7C3AED', Pathology: '#DB2777', Other: ORANGE };
  const color     = catColors[report.category] || GRAY;
  const hasValues = report.parsedValues && Object.keys(report.parsedValues).length > 0;
  return (
    <TouchableOpacity style={s.reportCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.reportAccent, { backgroundColor: color }]} />
      <View style={s.reportBody}>
        <View style={s.reportTop}>
          <View style={[s.catBadge, { backgroundColor: color + '18' }]}>
            <Text style={[s.catBadgeText, { color }]}>{report.category}</Text>
          </View>
          {report.status === 'abnormal' && (
            <View style={s.abnormalBadge}><Text style={s.abnormalText}>⚠ Review</Text></View>
          )}
          {report.type === 'pdf' && (
            <View style={s.pdfBadge}><Text style={s.pdfText}>📄 PDF</Text></View>
          )}
          {hasValues && (
            <View style={s.valuesBadge}><Text style={s.valuesText}>📊 Values saved</Text></View>
          )}
        </View>
        <Text style={s.reportName}>{report.name}</Text>
        <View style={s.reportBottom}>
          <Text style={s.reportMeta}>🏥 {report.lab}</Text>
          <Text style={s.reportDate}>📅 {report.date}</Text>
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity style={s.viewBtn} onPress={onPress}>
            <Text style={s.viewBtnText}>👁 View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteCardBtn} onPress={() => {
            Alert.alert('Delete Report', `Delete "${report.name}"?`, [
              { text: 'Cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(report.id) }
            ]);
          }}>
            <Text style={s.deleteCardBtnText}>🗑️ Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
      {report.image && report.type === 'image' && (
        <Image source={{ uri: report.image }} style={s.reportThumb} />
      )}
    </TouchableOpacity>
  );
}

// ── Processing Modal ──────────────────────────────────────────────────────────
function ProcessingModal({ visible, current, total, status }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={pm.overlay}>
        <View style={pm.card}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={pm.title}>{status || 'Processing...'}</Text>
          {total > 1 && (
            <Text style={pm.sub}>Report {current} of {total}</Text>
          )}
          <View style={pm.bar}>
            <View style={[pm.fill, { width: `${(current / total) * 100}%` }]} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Add Report Modal ──────────────────────────────────────────────────────────
function AddReportModal({ visible, onClose, onSave, memberId }) {
  const [step, setStep]             = useState(1);
  const [processing, setProcessing] = useState(false);
  const [procCurrent, setProcCurrent] = useState(0);
  const [procTotal, setProcTotal]   = useState(0);
  const [procStatus, setProcStatus] = useState('');
  const [image, setImage]           = useState(null);
  const [scanning, setScanning]     = useState(false);
  const [name, setName]             = useState('');
  const [lab, setLab]               = useState('');
  const [category, setCategory]     = useState('Blood');
  const [fileType, setFileType]     = useState('image');
  const [fileName, setFileName]     = useState('');
  const [parsedValues, setParsedValues] = useState({});

  async function processImage(uri, base64, type, fName) {
    setImage(uri);
    setFileType(type);
    if (fName) setFileName(fName);
    setScanning(true);
    setStep(2);

    try {
      let rawText = '';
      if (USE_AI_SERVICE) {
        try {
          const formData = new FormData();
          formData.append('file', { uri, type: 'image/jpeg', name: 'report.jpg' });
          const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/report`, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
          });
          const aiResult = await aiResponse.json();
          if (aiResult.success) {
            setName(aiResult.test_name || 'Lab Report');
            setLab(aiResult.lab_name  || 'Unknown Lab');
            setCategory(detectCategory(aiResult.test_name));
            rawText = aiResult.raw_text || '';
          }
        } catch(e) {
          rawText = await runOCR(base64);
          const parsed = parseReportText(rawText);
          setName(parsed.name); setLab(parsed.lab); setCategory(parsed.category);
        }
      } else {
        rawText = await runOCR(base64);
        const parsed = parseReportText(rawText);
        setName(parsed.name); setLab(parsed.lab); setCategory(parsed.category);
      }

      // Parse lab values and save to timeline
      if (rawText) {
        const today  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const values = await parseAndSaveLabValues(rawText, today, memberId);
        setParsedValues(values);
      }
    } catch(e) {
      Alert.alert('OCR Error', 'Could not read report. Please fill details manually.');
    }
    setScanning(false);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.9 });
    if (!result.canceled) {
      await processImage(result.assets[0].uri, result.assets[0].base64, 'image', null);
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow gallery access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.9 });
    if (!result.canceled) {
      await processImage(result.assets[0].uri, result.assets[0].base64, 'image', null);
    }
  }

  // ── Multi-upload from gallery ─────────────────────────────────────────────
  async function pickMultipleFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow gallery access.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      base64:                  true,
      quality:                 0.9,
      allowsMultipleSelection: true,
      mediaTypes:              ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const assets = result.assets;
      setProcessing(true);
      setProcTotal(assets.length);
      const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const newReports = [];

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setProcCurrent(i + 1);
        setProcStatus(`Running OCR on report ${i + 1} of ${assets.length}...`);

        let reportName = `Lab Report ${i + 1}`;
        let labName    = 'Unknown Lab';
        let cat        = 'Blood';
        let rawText    = '';
        let values     = {};

        try {
          rawText = await runOCR(asset.base64);
          const parsed = parseReportText(rawText);
          reportName = parsed.name;
          labName    = parsed.lab;
          cat        = parsed.category;
          values     = await parseAndSaveLabValues(rawText, today, memberId);
        } catch(e) {}

        newReports.push({
          id:           Date.now().toString() + i,
          name:         reportName,
          lab:          labName,
          date:         today,
          category:     cat,
          status:       'normal',
          image:        asset.uri,
          type:         'image',
          parsedValues: values,
        });
      }

      setProcessing(false);
      onSave(newReports);
      onClose();
      Alert.alert('✅ Done', `${newReports.length} report${newReports.length > 1 ? 's' : ''} uploaded successfully!\n\nHealth values have been saved to your Timeline.`);
    }
  }

  // ── WhatsApp image ────────────────────────────────────────────────────────
  async function pickFromWhatsAppImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow gallery access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled) {
      await processImage(result.assets[0].uri, result.assets[0].base64, 'image', null);
    }
  }

  // ── WhatsApp PDF ──────────────────────────────────────────────────────────
  async function pickFromWhatsAppPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const isPDF = asset.mimeType === 'application/pdf' || asset.name?.toLowerCase().endsWith('.pdf');
        setImage(asset.uri);
        setFileType(isPDF ? 'pdf' : 'image');
        setFileName(asset.name || 'WhatsApp Document');
        setName(asset.name?.replace('.pdf','').replace(/_/g,' ') || 'Lab Report');
        setStep(2);
        setScanning(false);
        if (isPDF) {
          Alert.alert('📄 PDF Selected', `File: ${asset.name}\n\nPlease fill in the report details below.`);
        }
      }
    } catch(e) {
      Alert.alert('Error', 'Could not open file. Please save it from WhatsApp first then try again.');
    }
  }

  async function pickPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImage(asset.uri); setFileType('pdf'); setFileName(asset.name);
        setName(asset.name.replace('.pdf','').replace(/_/g,' '));
        setStep(2); setScanning(false);
      }
    } catch { Alert.alert('Error', 'Could not open PDF.'); }
  }

  function handleSave() {
    if (!name.trim() || !lab.trim()) { Alert.alert('Missing info', 'Please enter report name and lab name.'); return; }
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    onSave([{
      id: Date.now().toString(), name: name.trim(), lab: lab.trim(),
      date: today, category, status: 'normal', image, type: fileType, fileName, parsedValues,
    }]);
    handleClose();
  }

  function handleClose() {
    setStep(1); setImage(null); setName(''); setLab(''); setCategory('Blood');
    setFileType('image'); setFileName(''); setParsedValues({}); setScanning(false);
    onClose();
  }

  const methods = [
    { emoji: '📷', title: 'Take Photo',             desc: 'Photograph your lab report — OCR reads it automatically', action: takePhoto,               color: TEAL_LT   },
    { emoji: '📚', title: 'Upload Multiple Reports', desc: 'Select multiple images at once — all processed together', action: pickMultipleFromGallery,  color: '#FFF8EC' },
    { emoji: '💬', title: 'From WhatsApp — Image',  desc: 'Pick a report image received on WhatsApp',               action: pickFromWhatsAppImage,    color: '#E7F8EE' },
    { emoji: '📄', title: 'From WhatsApp — PDF',    desc: 'Pick a PDF report received on WhatsApp',                 action: pickFromWhatsAppPDF,      color: '#F5F3FF' },
    { emoji: '🖼️', title: 'Upload from Gallery',    desc: 'Select any existing photo from your phone',              action: pickFromGallery,           color: '#F0FDF4' },
    { emoji: '📁', title: 'Upload PDF',              desc: 'Select a PDF lab report from your phone',               action: pickPDF,                   color: '#FEF3C7' },
    { emoji: '⌨️', title: 'Enter Manually',          desc: 'Type the report details yourself',                       action: () => setStep(2),         color: '#F3F4F6' },
  ];

  return (
    <>
      <ProcessingModal
        visible={processing}
        current={procCurrent}
        total={procTotal}
        status={procStatus}
      />
      <Modal visible={visible && !processing} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Add Lab Report</Text>

            {step === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={s.sheetSubtitle}>How would you like to add this report?</Text>
                {methods.map((m, i) => (
                  <TouchableOpacity key={i} style={s.methodBtn} onPress={m.action} activeOpacity={0.8}>
                    <View style={[s.methodIconBox, { backgroundColor: m.color }]}>
                      <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                    </View>
                    <View style={s.methodInfo}>
                      <Text style={s.methodTitle}>{m.title}</Text>
                      <Text style={s.methodDesc}>{m.desc}</Text>
                    </View>
                    <Text style={s.methodArrow}>›</Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {step === 2 && (
              <>
                {image && fileType === 'image' && (
                  <Image source={{ uri: image }} style={s.previewImg} resizeMode="cover" />
                )}
                {fileType === 'pdf' && (
                  <View style={s.pdfPreview}>
                    <Text style={s.pdfPreviewEmoji}>📄</Text>
                    <Text style={s.pdfPreviewName}>{fileName}</Text>
                    <Text style={s.pdfPreviewSub}>PDF uploaded successfully</Text>
                  </View>
                )}
                {scanning ? (
                  <View style={s.scanningBox}>
                    <ActivityIndicator size="large" color={TEAL} />
                    <Text style={s.scanningText}>Reading report with AI OCR...</Text>
                    <Text style={s.scanningHint}>Extracting values for Timeline</Text>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {name !== 'Lab Report' && (
                      <View style={s.ocrBanner}>
                        <Text style={s.ocrBannerText}>✅ OCR extracted details — please review before saving</Text>
                      </View>
                    )}
                    {Object.keys(parsedValues).length > 0 && (
                      <ParsedValuesCard values={parsedValues} />
                    )}
                    <Text style={s.fieldLabel}>Report Name</Text>
                    <TextInput style={s.input} placeholder="e.g. Complete Blood Count" value={name} onChangeText={setName} />
                    <Text style={s.fieldLabel}>Lab Name</Text>
                    <TextInput style={s.input} placeholder="e.g. SRL Diagnostics" value={lab} onChangeText={setLab} />
                    <Text style={s.fieldLabel}>Category</Text>
                    <View style={s.catRow}>
                      {['Blood', 'Urine', 'Imaging', 'Pathology', 'Other'].map(c => (
                        <TouchableOpacity key={c} style={[s.catChip, category === c && s.catChipActive]} onPress={() => setCategory(c)}>
                          <Text style={[s.catChipText, category === c && s.catChipTextActive]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.modalActions}>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => setStep(1)}>
                        <Text style={s.cancelText}>← Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                        <Text style={s.saveText}>Save Report</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ height: 20 }} />
                  </ScrollView>
                )}
              </>
            )}

            <TouchableOpacity style={s.closeX} onPress={handleClose}>
              <Text style={s.closeXText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ReportsScreen({ activeMember }) {
  const [reports, setReports]         = useState([]);
  const [activeCategory, setActive]   = useState('All');
  const [modalVisible, setModal]      = useState(false);
  const [selectedReport, setSelected] = useState(null);
  const [viewerVisible, setViewer]    = useState(false);
  const memberId = activeMember?.id || 'default';

  useEffect(() => { loadReports(); }, [activeMember]);

  async function loadReports() {
    const saved = await getReports(memberId);
    setReports(saved);
  }

  async function handleSave(newReports) {
    let current = await getReports(memberId);
    const updated = [...newReports, ...current];
    const { saveReports } = require('../storage');
    await saveReports(updated, memberId);
    setReports(updated);
  }

  async function handleDelete(id) {
    const updated = await deleteReport(id, memberId);
    setReports(updated);
  }

  const filtered = activeCategory === 'All' ? reports : reports.filter(r => r.category === activeCategory);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Lab Reports</Text>
          <Text style={s.subtitle}>{reports.length} reports  {activeMember ? `· ${activeMember.name}` : ''}</Text>
        </View>
        <TouchableOpacity style={s.uploadBtn} onPress={() => setModal(true)}>
          <Text style={s.uploadBtnText}>+ Upload</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <Text style={s.searchPlaceholder}>Search reports...</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {CATEGORIES.map(c => (
          <CategoryPill key={c} label={c} active={activeCategory === c} onPress={() => setActive(c)} />
        ))}
      </ScrollView>

      <ScrollView style={s.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
        {filtered.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📂</Text>
            <Text style={s.emptyTitle}>No reports yet</Text>
            <Text style={s.emptyText}>Tap + Upload to add your first lab report</Text>
          </View>
        )}
        {filtered.map(r => (
          <ReportCard key={r.id} report={r}
            onPress={() => { setSelected(r); setViewer(true); }}
            onDelete={handleDelete}
          />
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <AddReportModal
        visible={modalVisible}
        onClose={() => setModal(false)}
        onSave={handleSave}
        memberId={memberId}
      />
      <ReportViewer
        report={selectedReport}
        visible={viewerVisible}
        onClose={() => setViewer(false)}
        onDelete={handleDelete}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pv = StyleSheet.create({
  card:   { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, margin: 16, borderLeftWidth: 4, borderLeftColor: GREEN },
  title:  { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 10 },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item:   { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, minWidth: 100 },
  label:  { fontSize: 11, color: GRAY },
  value:  { fontSize: 15, fontWeight: '700', color: DARK, marginTop: 2 },
});

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card:    { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, width: 280, alignItems: 'center' },
  title:   { fontSize: 15, fontWeight: '700', color: DARK, marginTop: 14, textAlign: 'center' },
  sub:     { fontSize: 13, color: GRAY, marginTop: 6 },
  bar:     { width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, marginTop: 16, overflow: 'hidden' },
  fill:    { height: '100%', backgroundColor: TEAL, borderRadius: 3 },
});

const v = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '95%', paddingBottom: 20 },
  header:       { flexDirection: 'row', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title:        { fontSize: 17, fontWeight: '800', color: DARK },
  sub:          { fontSize: 13, color: GRAY, marginTop: 3 },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: GRAY, fontWeight: '700' },
  reportImage:  { width: '100%', height: 320, backgroundColor: '#F9FAFB' },
  pdfBox:       { alignItems: 'center', padding: 40, backgroundColor: '#F5F3FF' },
  pdfEmoji:     { fontSize: 52, marginBottom: 12 },
  pdfName:      { fontSize: 15, fontWeight: '700', color: DARK, textAlign: 'center' },
  openPdfBtn:   { marginTop: 16, backgroundColor: '#7C3AED', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  openPdfBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  noImageBox:   { alignItems: 'center', padding: 40, backgroundColor: '#F9FAFB' },
  noImageEmoji: { fontSize: 48, marginBottom: 12 },
  noImageText:  { fontSize: 14, color: GRAY },
  detailsCard:  { margin: 16, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16 },
  detailsTitle: { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 12 },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  detailLabel:  { fontSize: 13, color: GRAY },
  detailValue:  { fontSize: 13, fontWeight: '600', color: DARK },
  actions:      { paddingHorizontal: 16, gap: 10 },
  shareBtn:     { backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  deleteBtn:    { backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnText: { color: RED, fontWeight: '700', fontSize: 15 },
});

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: BG },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title:             { fontSize: 22, fontWeight: '800', color: DARK },
  subtitle:          { fontSize: 13, color: GRAY, marginTop: 2 },
  uploadBtn:         { backgroundColor: TEAL, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10, elevation: 3, shadowColor: TEAL, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  uploadBtnText:     { color: '#FFF', fontWeight: '700', fontSize: 14 },
  searchBar:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, elevation: 1, gap: 8 },
  searchIcon:        { fontSize: 16 },
  searchPlaceholder: { fontSize: 14, color: '#9CA3AF' },
  pillRow:           { maxHeight: 44, marginBottom: 16 },
  pill:              { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  pillActive:        { backgroundColor: TEAL, borderColor: TEAL },
  pillText:          { fontSize: 13, color: GRAY, fontWeight: '500' },
  pillTextActive:    { color: '#FFFFFF', fontWeight: '600' },
  list:              { flex: 1 },
  reportCard:        { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  reportAccent:      { width: 4 },
  reportBody:        { flex: 1, padding: 14 },
  reportTop:         { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  catBadge:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText:      { fontSize: 11, fontWeight: '700' },
  abnormalBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FEF3C7' },
  abnormalText:      { fontSize: 11, fontWeight: '700', color: ORANGE },
  pdfBadge:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F3FF' },
  pdfText:           { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  valuesBadge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F0FDF4' },
  valuesText:        { fontSize: 11, fontWeight: '700', color: GREEN },
  reportName:        { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 8 },
  reportBottom:      { flexDirection: 'row', gap: 12, marginBottom: 10 },
  reportMeta:        { fontSize: 12, color: GRAY },
  reportDate:        { fontSize: 12, color: GRAY },
  reportThumb:       { width: 70, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  cardActions:       { flexDirection: 'row', gap: 8 },
  viewBtn:           { flex: 1, backgroundColor: TEAL_LT, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  viewBtnText:       { fontSize: 12, fontWeight: '700', color: TEAL },
  deleteCardBtn:     { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  deleteCardBtnText: { fontSize: 12, fontWeight: '700', color: RED },
  empty:             { alignItems: 'center', paddingTop: 60 },
  emptyEmoji:        { fontSize: 52, marginBottom: 14 },
  emptyTitle:        { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 6 },
  emptyText:         { fontSize: 14, color: GRAY, textAlign: 'center' },
  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:             { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, maxHeight: '92%' },
  sheetHandle:       { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:        { fontSize: 20, fontWeight: '800', color: DARK, marginBottom: 4 },
  sheetSubtitle:     { fontSize: 14, color: GRAY, marginBottom: 16 },
  methodBtn:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  methodIconBox:     { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  methodInfo:        { flex: 1 },
  methodTitle:       { fontSize: 14, fontWeight: '700', color: DARK },
  methodDesc:        { fontSize: 12, color: GRAY, marginTop: 2 },
  methodArrow:       { fontSize: 22, color: '#D1D5DB' },
  previewImg:        { width: '100%', height: 160, borderRadius: 12, marginBottom: 16 },
  pdfPreview:        { alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 20, marginBottom: 16 },
  pdfPreviewEmoji:   { fontSize: 40, marginBottom: 8 },
  pdfPreviewName:    { fontSize: 14, fontWeight: '700', color: DARK, textAlign: 'center' },
  pdfPreviewSub:     { fontSize: 12, color: GRAY, marginTop: 4 },
  scanningBox:       { alignItems: 'center', paddingVertical: 32 },
  scanningText:      { fontSize: 15, fontWeight: '600', color: DARK, marginTop: 14 },
  scanningHint:      { fontSize: 13, color: GRAY, marginTop: 6 },
  ocrBanner:         { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: GREEN },
  ocrBannerText:     { fontSize: 13, color: '#065F46' },
  fieldLabel:        { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 6 },
  input:             { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 13, fontSize: 14, color: DARK, marginBottom: 16, backgroundColor: '#FAFAFA' },
  catRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  catChipActive:     { backgroundColor: TEAL_LT, borderColor: TEAL },
  catChipText:       { fontSize: 13, color: GRAY, fontWeight: '500' },
  catChipTextActive: { color: TEAL, fontWeight: '700' },
  modalActions:      { flexDirection: 'row', gap: 12 },
  cancelBtn:         { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText:        { fontSize: 14, color: GRAY, fontWeight: '600' },
  saveBtn:           { flex: 1, padding: 15, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center' },
  saveText:          { fontSize: 14, color: '#FFF', fontWeight: '700' },
  closeX:            { position: 'absolute', top: 20, right: 20, padding: 8 },
  closeXText:        { fontSize: 18, color: '#9CA3AF' },
});