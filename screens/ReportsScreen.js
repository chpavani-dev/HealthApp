import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Image,
  ActivityIndicator, Linking, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { usePermission } from '../PermissionContext';
import {
  getReports, addReport, deleteReport, parseAndSaveLabValues,
  saveLabReportFromAI, saveReports, findExactDuplicateReports
} from '../storage';
import { getLabReportOriginalUrl } from '../cloudSync';
import ViewOnlyBanner from '../ViewOnlyBanner';

const { width } = Dimensions.get('window');
const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const RED     = '#EF4444';
const RED_LT  = '#FEF2F2';
const RED_DK  = '#A32D2D';
const PURPLE  = '#7C3AED';
const PINK    = '#DB2777';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';


const AI_SERVICE_URL = 'https://medrecord-ai-production.up.railway.app';
const USE_AI_SERVICE = true;

const CATEGORIES = ['All', 'Blood', 'Urine', 'Imaging', 'Pathology', 'Cardiac', 'Other'];

// Date helpers
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDisplay(isoOrAny) {
  if (!isoOrAny) return '—';
  try {
    const d = new Date(isoOrAny);
    if (isNaN(d.getTime())) return String(isoOrAny);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(isoOrAny); }
}

function toIsoDate(any) {
  if (!any) return todayISO();
  if (/^\d{4}-\d{2}-\d{2}/.test(String(any))) return String(any).slice(0, 10);
  try {
    const d = new Date(any);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return todayISO();
}

const CAT_COLORS = {
  Blood:     TEAL,
  Urine:     GREEN,
  Imaging:   PURPLE,
  Pathology: PINK,
  Cardiac:   RED_DK,
  Other:     ORANGE,
};

// Legacy OCR fallback
async function runOCRFallback(uri) {
  try {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'image.jpg' });
    const response = await fetch(`${AI_SERVICE_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: formData,
    });
    const data = await response.json();
    return data.text || '';
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
      if (lower.includes('urine'))                                             category = 'Urine';
      else if (lower.includes('xray') || lower.includes('mri') || lower.includes('scan')) category = 'Imaging';
      else                                                                      category = 'Blood';
      break;
    }
  }
  return { name, lab, category };
}

function TestRow({ test }) {
  const isAbnormal = ['low','high','critical_low','critical_high','abnormal'].includes(test.flag);
  const isCritical = test.flag === 'critical_low' || test.flag === 'critical_high';
  const valueColor = isCritical ? RED_DK : isAbnormal ? RED_DK : DARK;

  return (
    <View style={tr.row}>
      <View style={tr.left}>
        {isAbnormal && <Text style={tr.warnIcon}>⚠</Text>}
        <Text style={[tr.name, isAbnormal && tr.nameAbnormal]}>{test.name}</Text>
      </View>
      <View style={tr.right}>
        <Text style={[tr.value, { color: valueColor }]}>
          {test.value !== null && test.value !== undefined ? String(test.value) : '—'}
        </Text>
        {test.unit && <Text style={tr.unit}> {test.unit}</Text>}
        {test.normal_range && (
          <Text style={tr.range}>Normal: {test.normal_range}</Text>
        )}
      </View>
    </View>
  );
}

function ReportViewer({ report, visible, onClose, onDelete, onEditLab, canEdit = true }) {
  const [cloudUrl, setCloudUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    if (!visible || !report?.imageUrl) {
      setCloudUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingUrl(true);
      const result = await getLabReportOriginalUrl(report.imageUrl);
      if (!cancelled) {
        setCloudUrl(result?.url || null);
        setLoadingUrl(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, report?.imageUrl]);

  if (!report) return null;
  const tests        = report.tests || [];
  const abnormalCount = report.abnormalCount ?? tests.filter(t =>
    ['low','high','critical_low','critical_high','abnormal'].includes(t.flag)
  ).length;
  const categoryColor = CAT_COLORS[report.category] || GRAY;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={v.overlay}>
        <View style={v.sheet}>
          <View style={v.header}>
            <View style={{ flex: 1 }}>
              <View style={v.titleRow}>
                <View style={[v.catPill, { backgroundColor: categoryColor + '22' }]}>
                  <Text style={[v.catPillText, { color: categoryColor }]}>{report.category || 'Other'}</Text>
                </View>
                {tests.length > 0 && (
                  <View style={v.testCountPill}>
                    <Text style={v.testCountPillText}>{tests.length} tests</Text>
                  </View>
                )}
              </View>
              <Text style={v.title}>{report.name}</Text>
              <Text style={v.sub}>{report.lab}  ·  {formatDateDisplay(report.date)}</Text>
            </View>
            <TouchableOpacity style={v.closeBtn} onPress={onClose}>
              <Text style={v.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {abnormalCount > 0 && (
              <View style={v.abnormalBanner}>
                <Text style={v.abnormalBannerTitle}>⚠ {abnormalCount} value{abnormalCount > 1 ? 's' : ''} need attention</Text>
                <Text style={v.abnormalBannerSub}>
                  Some values are outside the normal range. Discuss with your doctor.
                </Text>
              </View>
            )}

            {tests.length > 0 && (
              <View style={v.testsSection}>
                {tests.map((t, idx) => <TestRow key={idx} test={t} />)}
              </View>
            )}

            {report.image && report.type === 'image' && (
              <Image source={{ uri: report.image }} style={v.reportImage} resizeMode="contain" />
            )}
            {report.type === 'pdf' && (
              <View style={v.pdfBox}>
                <Text style={v.pdfEmoji}>📄</Text>
                <Text style={v.pdfName}>{report.fileName || report.name}</Text>
                {loadingUrl ? (
                  <ActivityIndicator color={TEAL} style={{ marginTop: 12 }} />
                ) : (
                  <TouchableOpacity style={v.openPdfBtn} onPress={async () => {
                    const uri = cloudUrl || report.image;
                    if (!uri) {
                      Alert.alert('Not available', 'Original file not found on device or cloud.');
                      return;
                    }
                    if (cloudUrl) {
                      // Open cloud URL in browser
                      Linking.openURL(uri).catch(() => {
                        Alert.alert('Could not open PDF', 'Try sharing the file instead.');
                      });
                    } else {
                      // Local file — use Sharing API
                      const ok = await Sharing.isAvailableAsync();
                      if (ok) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
                    }
                  }}>
                    <Text style={v.openPdfBtnText}>Open PDF ↗</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={v.detailsCard}>
              <View style={v.detailsHeader}>
                <Text style={v.detailsTitle}>Report Details</Text>
                <TouchableOpacity onPress={() => onEditLab(report)}>
                  <Text style={v.editLink}>Edit lab</Text>
                </TouchableOpacity>
              </View>
              {[
                { label: 'Lab',         value: report.lab },
                { label: 'Test date',   value: formatDateDisplay(report.date) },
                { label: 'Category',    value: report.category || 'Other' },
                { label: 'Panel',       value: report.name },
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
                  const msg = `🏥 *${report.name}*\n📍 Lab: ${report.lab}\n📅 Date: ${formatDateDisplay(report.date)}`;
                  await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
                }
              }}>
                <Text style={v.shareBtnText}>💬 Share on WhatsApp</Text>
              </TouchableOpacity>
           {canEdit && (
              <TouchableOpacity style={v.deleteBtn} onPress={() => {
                Alert.alert('Delete Report', `Delete "${report.name}"?`, [
                  { text: 'Cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { onDelete(report.id); onClose(); } }
                ]);
              }}>
                <Text style={v.deleteBtnText}>🗑️ Delete Report</Text>
              </TouchableOpacity>
             )}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditLabModal({ report, visible, onClose, onSave }) {
  const [labName, setLabName] = useState('');
  useEffect(() => { if (report) setLabName(report.lab || ''); }, [report]);
  if (!report) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={el.overlay}>
        <View style={el.sheet}>
          <View style={el.handle} />
          <Text style={el.title}>Edit Lab Name</Text>
          <Text style={el.sub}>Update the lab name for this report</Text>
          <Text style={el.fieldLabel}>Lab Name</Text>
          <TextInput
            style={el.input}
            value={labName}
            onChangeText={setLabName}
            placeholder="e.g. SRL Diagnostics"
          />
          <Text style={el.note}>📅 Test date is locked at {formatDateDisplay(report.date)} to keep your trend chart accurate.</Text>
          <View style={el.actions}>
            <TouchableOpacity style={el.cancelBtn} onPress={onClose}>
              <Text style={el.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={el.saveBtn} onPress={() => {
              if (!labName.trim()) { Alert.alert('Required', 'Please enter a lab name.'); return; }
              onSave(report.id, labName.trim());
            }}>
              <Text style={el.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CategoryPill({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.pill, active && s.pillActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.pillText, active && s.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ReportCard({ report, onPress, onDelete, canEdit = true }) {
  const color = CAT_COLORS[report.category] || GRAY;
  const abnormalCount = report.abnormalCount ?? 0;
  const testCount     = report.testCount    ?? (report.tests?.length ?? 0);

  return (
    <TouchableOpacity style={s.reportCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.reportAccent, { backgroundColor: color }]} />
      <View style={s.reportBody}>
        <View style={s.reportTop}>
          <View style={[s.catBadge, { backgroundColor: color + '18' }]}>
            <Text style={[s.catBadgeText, { color }]}>{report.category || 'Other'}</Text>
          </View>
          {abnormalCount > 0 && (
            <View style={s.abnormalBadge}>
              <Text style={s.abnormalText}>⚠ {abnormalCount} abnormal</Text>
            </View>
          )}
          {abnormalCount === 0 && testCount > 0 && (
            <View style={s.normalBadge}>
              <Text style={s.normalText}>✓ All normal</Text>
            </View>
          )}
          {report.type === 'pdf' && (
            <View style={s.pdfBadge}><Text style={s.pdfText}>📄 PDF</Text></View>
          )}
        </View>
        <Text style={s.reportName} numberOfLines={2}>{report.name}</Text>
        <View style={s.reportBottom}>
          <Text style={s.reportMeta}>🏥 {report.lab}</Text>
          <Text style={s.reportDate}>📅 {formatDateDisplay(report.date)}</Text>
        </View>
        {testCount > 0 && (
          <Text style={s.testCountLine}>{testCount} test{testCount !== 1 ? 's' : ''}</Text>
        )}
        <View style={s.cardActions}>
         <TouchableOpacity style={s.viewBtn} onPress={onPress}>
            <Text style={s.viewBtnText}>👁 View</Text>
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity style={s.deleteCardBtn} onPress={() => {
              Alert.alert('Delete Report', `Delete "${report.name}"?`, [
                { text: 'Cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(report.id) }
              ]);
            }}>
              <Text style={s.deleteCardBtnText}>🗑️ Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    {/* Image preview — prefer cloud URL, fall back to local */}
            {(report.type === 'image' || !report.type) && (report.imageUrl || report.image) && (
              <View>
                {loadingUrl && (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={TEAL} />
                    <Text style={{ marginTop: 8, color: GRAY, fontSize: 12 }}>Loading original...</Text>
                  </View>
                )}
                <Image 
                  source={{ uri: cloudUrl || report.image }} 
                  style={v.reportImage} 
                  resizeMode="contain"
                />
              </View>
            )}
    </TouchableOpacity>
  );
}

function ProcessingModal({ visible, current, total, status }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={pm.overlay}>
        <View style={pm.card}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={pm.title}>{status || 'Processing...'}</Text>
          {total > 1 && (
            <Text style={pm.sub}>Document {current} of {total}</Text>
          )}
          <View style={pm.bar}>
            <View style={[pm.fill, { width: `${(current / Math.max(total, 1)) * 100}%` }]} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Duplicate alert helper (centralized message)
function showDuplicateBlockedAlert(matches) {
  const listLines = matches.map(m => `• ${m.existingReportName}`).join('\n');
  Alert.alert(
    '⚠ Duplicate Report',
    `This report has already been saved with the same lab, date, and panel name:\n\n${listLines}\n\nUpload cancelled. To replace this report, please delete the existing one from the Reports list first.`,
    [{ text: 'OK' }]
  );
}

function AddReportModal({ visible, onClose, onSaveResults, memberId }) {
  const [step, setStep]                  = useState(1);
  const [processing, setProcessing]      = useState(false);
  const [procCurrent, setProcCurrent]    = useState(0);
  const [procTotal, setProcTotal]        = useState(0);
  const [procStatus, setProcStatus]      = useState('');
  const [image, setImage]                = useState(null);
  const [scanning, setScanning]          = useState(false);
  const [fileType, setFileType]          = useState('image');
  const [fileName, setFileName]          = useState('');

  const [aiResult, setAiResult]          = useState(null);
  const [editLab, setEditLab]            = useState('');
  const [editDate, setEditDate]          = useState('');

  const [manualName, setManualName]      = useState('');
  const [manualLab,  setManualLab]       = useState('');
  const [manualCategory, setManualCategory] = useState('Blood');

  function resetAll() {
    setStep(1); setImage(null); setFileType('image'); setFileName('');
    setScanning(false); setAiResult(null);
    setEditLab(''); setEditDate('');
    setManualName(''); setManualLab(''); setManualCategory('Blood');
  }
async function processPDFReport(asset) {
    setImage(asset.uri);
    setFileType('pdf');
    setFileName(asset.name || 'document.pdf');
    setScanning(true);
    setStep(2);

    try {
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: 'application/pdf', name: asset.name || 'report.pdf' });
      const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/report`, {
        method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
      });
      const result = await aiResponse.json();
      if (result.success && Array.isArray(result.panels) && result.panels.length > 0) {
        // Duplicate check before review screen
        try {
          const dupCheck = await findExactDuplicateReports(result, memberId);
          if (dupCheck.allDuplicate) {
            setScanning(false);
            showDuplicateBlockedAlert(dupCheck.matches);
            handleClose();
            return;
          }
        } catch (dupErr) {
          console.log('Duplicate check error:', dupErr);
        }
        setAiResult(result);
        setEditLab(result.lab_name || 'Unknown Lab');
        setEditDate(result.report_date || todayISO());
      } else {
        Alert.alert(
          'PDF parsed but no panels found',
          'Please review or enter details manually below.'
        );
        setManualName((asset.name || 'Lab Report').replace('.pdf','').replace(/_/g,' '));
        setEditLab('Unknown Lab');
        setEditDate(todayISO());
      }
    } catch(e) {
      Alert.alert('PDF processing failed', 'Could not read PDF. Please enter details manually.');
      setManualName((asset.name || 'Lab Report').replace('.pdf','').replace(/_/g,' '));
      setEditLab('Unknown Lab');
      setEditDate(todayISO());
    }
    setScanning(false);
  }
  async function processImage(uri, base64, type, fName) {
    setImage(uri);
    setFileType(type);
    if (fName) setFileName(fName);
    setScanning(true);
    setStep(2);

    try {
      let aiOk = false;
      if (USE_AI_SERVICE) {
        try {
          const formData = new FormData();
          formData.append('file', { uri, type: 'image/jpeg', name: 'report.jpg' });
          const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/report`, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
          });
          const result = await aiResponse.json();
          if (result.success && Array.isArray(result.panels) && result.panels.length > 0) {
            // === NEW: duplicate check BEFORE showing review screen ===
            try {
              const dupCheck = await findExactDuplicateReports(result, memberId);
              if (dupCheck.allDuplicate) {
                setScanning(false);
                showDuplicateBlockedAlert(dupCheck.matches);
                handleClose();
                return;
              }
            } catch (dupErr) {
              console.log('Duplicate check error:', dupErr);
              // On error, allow the upload to continue rather than blocking
            }

            setAiResult(result);
            setEditLab(result.lab_name || 'Unknown Lab');
            setEditDate(result.report_date || todayISO());
            aiOk = true;
          }
        } catch(e) { /* fall through */ }
      }

      if (!aiOk) {
        const rawText = await runOCRFallback(uri);
        if (rawText) {
          const parsed = parseReportText(rawText);
          setManualName(parsed.name);
          setManualLab(parsed.lab);
          setManualCategory(parsed.category);
          setEditLab(parsed.lab);
          setEditDate(todayISO());
          await parseAndSaveLabValues(rawText, todayISO(), memberId);
        } else {
          Alert.alert('OCR Error', 'Could not read report. Please fill details manually.');
        }
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

      let totalReports   = 0;
      let totalValues    = 0;
      let totalNewMetrics = [];
      let totalAbnormal  = 0;
      let totalSkippedDuplicates = 0;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setProcCurrent(i + 1);
        setProcStatus(`Analyzing document ${i + 1} of ${assets.length}...`);

        let aiOk = false;
        try {
          const formData = new FormData();
          formData.append('file', { uri: asset.uri, type: 'image/jpeg', name: `report_${i}.jpg` });
          const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/report`, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
          });
          const result = await aiResponse.json();
          if (result.success && Array.isArray(result.panels) && result.panels.length > 0) {
            // Duplicate check for this image
            try {
              const dupCheck = await findExactDuplicateReports(result, memberId);
              if (dupCheck.allDuplicate) {
                totalSkippedDuplicates += 1;
                continue;
              }
            } catch (e) { /* allow through on error */ }

            const saved = await saveLabReportFromAI(result, memberId, {});
            await attachImageToLatestReports(saved.reportsSaved, asset.uri, memberId);

            totalReports += saved.reportsSaved;
            totalValues  += saved.valuesAdded;
            totalNewMetrics = totalNewMetrics.concat(saved.newlyTrackedMetrics || []);
            totalAbnormal += (result.abnormal_findings?.length || 0);
            aiOk = true;
          }
        } catch(e) {}

        if (!aiOk) {
          try {
            const rawText = await runOCRFallback(asset.uri);
            if (rawText) {
              const today  = todayISO();
              const parsed = parseReportText(rawText);
              await parseAndSaveLabValues(rawText, today, memberId);
              const fallbackReport = {
                id:           Date.now().toString() + '_fb_' + i,
                name:         parsed.name,
                lab:          parsed.lab,
                date:         today,
                category:     parsed.category,
                status:       'normal',
                image:        asset.uri,
                type:         'image',
                tests:        [],
                testCount:    0,
                abnormalCount: 0,
                uploadedAt:   new Date().toISOString(),
              };
              await addReport(fallbackReport, memberId);
              totalReports += 1;
            }
          } catch(e) {}
        }
      }

      setProcessing(false);
      onSaveResults({
        reportsSaved:  totalReports,
        valuesAdded:   totalValues,
        newMetrics:    totalNewMetrics,
        abnormalCount: totalAbnormal,
        skippedDuplicates: totalSkippedDuplicates,
      });
      onClose();
      resetAll();
    }
  }

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

 async function pickFromWhatsAppPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const isPDF = asset.mimeType === 'application/pdf' || asset.name?.toLowerCase().endsWith('.pdf');
        if (isPDF) {
          await processPDFReport(asset);
        } else {
          // Image from WhatsApp — use existing image path
          setImage(asset.uri);
          setFileType('image');
          setFileName(asset.name || 'WhatsApp Document');
          await processImage(asset.uri, null, 'image', asset.name);
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
        await processPDFReport(asset);
      }
    } catch { Alert.alert('Error', 'Could not open PDF.'); }
  }

  async function handleSaveFromReview() {
    if (!editLab.trim()) { Alert.alert('Required', 'Please enter a lab name.'); return; }

    if (aiResult && Array.isArray(aiResult.panels) && aiResult.panels.length > 0) {
      const overrides = {
        labName:    editLab.trim(),
        reportDate: editDate || todayISO(),
      };

      // Re-check duplicates with user's edited lab/date in case they changed something
      try {
        const dupCheck = await findExactDuplicateReports(aiResult, memberId, overrides);
        if (dupCheck.allDuplicate) {
          showDuplicateBlockedAlert(dupCheck.matches);
          handleClose();
          return;
        }
      } catch (e) { /* allow through */ }

      const saved = await saveLabReportFromAI(aiResult, memberId, overrides);
      if (image) await attachImageToLatestReports(saved.reportsSaved, image, memberId, fileType, fileName);
      onSaveResults({
        reportsSaved:  saved.reportsSaved,
        valuesAdded:   saved.valuesAdded,
        newMetrics:    saved.newlyTrackedMetrics || [],
        abnormalCount: aiResult.abnormal_findings?.length || 0,
      });
      handleClose();
      return;
    }

    if (!manualName.trim()) { Alert.alert('Required', 'Please enter a report name.'); return; }
    const fallback = {
      id:           Date.now().toString(),
      name:         manualName.trim(),
      lab:          editLab.trim(),
      date:         editDate || todayISO(),
      category:     manualCategory,
      status:       'normal',
      image,
      type:         fileType,
      fileName,
      tests:        [],
      testCount:    0,
      abnormalCount: 0,
      uploadedAt:   new Date().toISOString(),
    };
    await addReport(fallback, memberId);
    onSaveResults({ reportsSaved: 1, valuesAdded: 0, newMetrics: [], abnormalCount: 0 });
    handleClose();
  }

  function handleClose() { resetAll(); onClose(); }

  const methods = [
    { emoji: '📷', title: 'Take Photo',              desc: 'Photograph your lab report — AI auto-detects panels',  action: takePhoto,                color: TEAL_LT   },
    { emoji: '📚', title: 'Upload Multiple Reports', desc: 'Select multiple images at once — all parsed together', action: pickMultipleFromGallery,   color: '#FFF8EC' },
    { emoji: '💬', title: 'From WhatsApp — Image',   desc: 'Pick a report image received on WhatsApp',             action: pickFromWhatsAppImage,     color: '#E7F8EE' },
    { emoji: '📄', title: 'From WhatsApp — PDF',     desc: 'Pick a PDF report received on WhatsApp',               action: pickFromWhatsAppPDF,       color: '#F5F3FF' },
    { emoji: '🖼️', title: 'Upload from Gallery',     desc: 'Select any existing photo from your phone',            action: pickFromGallery,           color: '#F0FDF4' },
    { emoji: '📁', title: 'Upload PDF',              desc: 'Select a PDF lab report from your phone',              action: pickPDF,                   color: '#FEF3C7' },
    { emoji: '⌨️', title: 'Enter Manually',          desc: 'Type the report details yourself',                     action: () => setStep(2),         color: '#F3F4F6' },
  ];

  const detectedPanels = aiResult?.panels || [];

  return (
    <>
      <ProcessingModal visible={processing} current={procCurrent} total={procTotal} status={procStatus} />
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
                {scanning ? (
                  <View style={s.scanningBox}>
                    <ActivityIndicator size="large" color={TEAL} />
                    <Text style={s.scanningText}>Reading report with AI...</Text>
                    <Text style={s.scanningHint}>Detecting panels and values</Text>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
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

                    <Text style={s.reviewHeading}>Review & save</Text>
                    <Text style={s.reviewSubhead}>
                      {detectedPanels.length > 0
                        ? 'We extracted these details. Edit if anything looks off.'
                        : 'Fill in the report details below.'}
                    </Text>

                    <Text style={s.fieldLabel}>Lab Name</Text>
                    <TextInput
                      style={s.input}
                      placeholder="e.g. SRL Diagnostics"
                      value={editLab}
                      onChangeText={setEditLab}
                    />

                    <Text style={s.fieldLabel}>Test Date</Text>
                    <TextInput
                      style={s.input}
                      placeholder="YYYY-MM-DD"
                      value={editDate}
                      onChangeText={setEditDate}
                    />
                    {aiResult?.report_date && (
                      <Text style={s.fieldHelp}>Found in document — used for trends</Text>
                    )}

                    {detectedPanels.length > 0 && (
                      <>
                        <Text style={[s.fieldLabel, { marginTop: 16 }]}>Panels Detected</Text>
                        {detectedPanels.map((p, i) => {
                          const abnormal = (p.tests || []).filter(t =>
                            ['low','high','critical_low','critical_high','abnormal'].includes(t.flag)
                          ).length;
                          const color = CAT_COLORS[p.category] || GRAY;
                          return (
                            <View key={i} style={s.panelCard}>
                              <View style={s.panelTop}>
                                <View style={[s.panelCatBadge, { backgroundColor: color + '22' }]}>
                                  <Text style={[s.panelCatText, { color }]}>{p.category || 'Other'}</Text>
                                </View>
                                <Text style={s.panelName} numberOfLines={1}>{p.panel_name || 'Lab Panel'}</Text>
                                <Text style={[s.panelStatus, { color: abnormal > 0 ? RED_DK : GREEN }]}>
                                  {abnormal > 0 ? `⚠ ${abnormal}` : '✓'}
                                </Text>
                              </View>
                              <Text style={s.panelMeta}>
                                {(p.tests?.length || 0)} test{(p.tests?.length || 0) !== 1 ? 's' : ''}
                                {abnormal > 0 ? ` · ${abnormal} abnormal` : ' · all normal'}
                              </Text>
                            </View>
                          );
                        })}

                        {aiResult?.abnormal_findings?.length > 0 && (
                          <View style={s.promoteNotice}>
                            <Text style={s.promoteText}>
                              📊 We'll auto-track abnormal values in your Trends.
                            </Text>
                          </View>
                        )}
                      </>
                    )}

                    {detectedPanels.length === 0 && (
                      <>
                        <Text style={s.fieldLabel}>Report Name</Text>
                        <TextInput
                          style={s.input}
                          placeholder="e.g. Complete Blood Count"
                          value={manualName}
                          onChangeText={setManualName}
                        />
                        <Text style={s.fieldLabel}>Category</Text>
                        <View style={s.catRow}>
                          {['Blood', 'Urine', 'Imaging', 'Pathology', 'Cardiac', 'Other'].map(c => (
                            <TouchableOpacity key={c}
                              style={[s.catChip, manualCategory === c && s.catChipActive]}
                              onPress={() => setManualCategory(c)}
                            >
                              <Text style={[s.catChipText, manualCategory === c && s.catChipTextActive]}>{c}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    <View style={s.modalActions}>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => setStep(1)}>
                        <Text style={s.cancelText}>← Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.saveBtn} onPress={handleSaveFromReview}>
                        <Text style={s.saveText}>
                          {detectedPanels.length > 1 ? `Save ${detectedPanels.length} reports` : 'Save'}
                        </Text>
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

async function attachImageToLatestReports(count, imageUri, memberId, fileType = 'image', fileName = '') {
  if (!count || !imageUri) return;
  try {
    const all = await getReports(memberId);
    const updated = all.map((r, idx) => {
      if (idx < count) {
        return { ...r, image: imageUri, type: fileType, fileName };
      }
      return r;
    });
    await saveReports(updated, memberId);
  } catch(e) { console.log('attachImage error:', e); }
}

export default function ReportsScreen({ activeMember, navigation }) {
  const [reports, setReports]         = useState([]);
  const [activeCategory, setActive]   = useState('All');
  const [modalVisible, setModal]      = useState(false);
  const [selectedReport, setSelected] = useState(null);
  const [viewerVisible, setViewer]    = useState(false);
  const [editLabReport, setEditLabReport] = useState(null);
  const [editLabVisible, setEditLabVisible] = useState(false);
  const memberId = activeMember?.id || 'default';
const { canEdit, isViewOnly } = usePermission();

  useEffect(() => { loadReports(); }, [activeMember]);

  async function loadReports() {
    const saved = await getReports(memberId);
    saved.sort((a, b) => toIsoDate(b.date).localeCompare(toIsoDate(a.date)));
    setReports(saved);
  }

  async function handleSaveResults({ reportsSaved, valuesAdded, newMetrics, abnormalCount, skippedDuplicates }) {
    await loadReports();
    const newMetricLine = (newMetrics && newMetrics.length > 0)
      ? `\n\n📈 New metric${newMetrics.length > 1 ? 's' : ''} added to Trends:\n${newMetrics.map(m => `   • ${m.label}`).join('\n')}`
      : '';
    const abnormalLine = abnormalCount > 0
      ? `\n⚠ ${abnormalCount} value${abnormalCount > 1 ? 's' : ''} flagged abnormal`
      : '';
    const skippedLine = skippedDuplicates > 0
      ? `\n⏭ ${skippedDuplicates} duplicate${skippedDuplicates > 1 ? 's' : ''} skipped`
      : '';

    if (reportsSaved === 0 && skippedDuplicates > 0) {
      Alert.alert('Duplicate Reports', `All ${skippedDuplicates} document${skippedDuplicates > 1 ? 's were' : ' was'} already saved. Nothing new added.`);
      return;
    }

    Alert.alert(
      '✅ Saved',
      `${reportsSaved} report${reportsSaved !== 1 ? 's' : ''} saved · ${valuesAdded} value${valuesAdded !== 1 ? 's' : ''} on timeline${abnormalLine}${skippedLine}${newMetricLine}`,
      [
        { text: 'Stay here', style: 'cancel' },
        ...(navigation ? [{ text: 'View Trends →', onPress: () => navigation.navigate('Timeline') }] : []),
      ]
    );
  }

  async function handleDelete(id) {
    const updated = await deleteReport(id, memberId);
    setReports(updated);
    setViewer(false);
  }

  function handleOpenEditLab(report) {
    setEditLabReport(report);
    setEditLabVisible(true);
  }

  async function handleSaveLabName(reportId, newLabName) {
    const all = await getReports(memberId);
    const updated = all.map(r => r.id === reportId ? { ...r, lab: newLabName } : r);
    await saveReports(updated, memberId);
    setReports(updated);
    setEditLabVisible(false);
    if (selectedReport && selectedReport.id === reportId) {
      setSelected({ ...selectedReport, lab: newLabName });
    }
  }

  const filtered = activeCategory === 'All'
    ? reports
    : reports.filter(r => r.category === activeCategory);

  return (
   <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ViewOnlyBanner memberName={activeMember?.name} />
      <View style={s.header}>
        <View>
          <Text style={s.title}>Lab Reports</Text>
          <Text style={s.subtitle}>{reports.length} reports  {activeMember ? `· ${activeMember.name}` : ''}</Text>
        </View>
        {canEdit && (
          <TouchableOpacity style={s.uploadBtn} onPress={() => setModal(true)}>
            <Text style={s.uploadBtnText}>+ Upload</Text>
          </TouchableOpacity>
        )}
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
            <Text style={s.emptyText}>
              {canEdit ? 'Tap + Upload to add your first lab report' : 'No reports shared yet'}
            </Text>
          </View>
        )}
        {filtered.map(r => (
         <ReportCard key={r.id} report={r}
            canEdit={canEdit}
            onPress={() => { setSelected(r); setViewer(true); }}
            onDelete={handleDelete}
          />
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>

      <AddReportModal
        visible={modalVisible}
        onClose={() => setModal(false)}
        onSaveResults={handleSaveResults}
        memberId={memberId}
      />
      <ReportViewer
        report={selectedReport}
        visible={viewerVisible}
        onClose={() => setViewer(false)}
        onDelete={handleDelete}
        onEditLab={handleOpenEditLab}
        canEdit={canEdit}
      />
      <EditLabModal
        report={editLabReport}
        visible={editLabVisible}
        onClose={() => setEditLabVisible(false)}
        onSave={handleSaveLabName}
      />
    </SafeAreaView>
  );
}

// Styles
const tr = StyleSheet.create({
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },
  left:          { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  warnIcon:      { color: RED_DK, fontSize: 14 },
  name:          { fontSize: 13, fontWeight: '500', color: DARK },
  nameAbnormal:  { fontWeight: '700' },
  right:         { alignItems: 'flex-end' },
  value:         { fontSize: 15, fontWeight: '600' },
  unit:          { fontSize: 11, color: GRAY },
  range:         { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
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
  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:             { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '95%', paddingBottom: 20 },
  header:            { flexDirection: 'row', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  titleRow:          { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  catPill:           { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catPillText:       { fontSize: 10, fontWeight: '700' },
  testCountPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F3F4F6' },
  testCountPillText: { fontSize: 10, fontWeight: '600', color: GRAY },
  title:             { fontSize: 17, fontWeight: '800', color: DARK },
  sub:               { fontSize: 13, color: GRAY, marginTop: 3 },
  closeBtn:          { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:      { fontSize: 14, color: GRAY, fontWeight: '700' },
  abnormalBanner:    { margin: 16, marginBottom: 0, backgroundColor: RED_LT, borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: RED_DK },
  abnormalBannerTitle: { fontSize: 13, fontWeight: '700', color: RED_DK },
  abnormalBannerSub:   { fontSize: 12, color: '#791F1F', marginTop: 4, lineHeight: 16 },
  testsSection:      { paddingHorizontal: 16, paddingVertical: 8 },
  reportImage:       { width: '100%', height: 320, backgroundColor: '#F9FAFB' },
  pdfBox:            { alignItems: 'center', padding: 40, backgroundColor: '#F5F3FF' },
  pdfEmoji:          { fontSize: 52, marginBottom: 12 },
  pdfName:           { fontSize: 15, fontWeight: '700', color: DARK, textAlign: 'center' },
  openPdfBtn:        { marginTop: 16, backgroundColor: PURPLE, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  openPdfBtnText:    { color: '#FFF', fontWeight: '700', fontSize: 14 },
  detailsCard:       { margin: 16, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16 },
  detailsHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailsTitle:      { fontSize: 14, fontWeight: '700', color: DARK },
  editLink:          { fontSize: 12, color: TEAL, fontWeight: '600' },
  detailRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  detailLabel:       { fontSize: 13, color: GRAY },
  detailValue:       { fontSize: 13, fontWeight: '600', color: DARK },
  actions:           { paddingHorizontal: 16, gap: 10 },
  shareBtn:          { backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareBtnText:      { color: '#FFF', fontWeight: '700', fontSize: 15 },
  deleteBtn:         { backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnText:     { color: RED, fontWeight: '700', fontSize: 15 },
});

const el = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  handle:     { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700', color: DARK },
  sub:        { fontSize: 13, color: GRAY, marginTop: 4, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 13, fontSize: 14, color: DARK, marginBottom: 12, backgroundColor: '#FAFAFA' },
  note:       { fontSize: 12, color: GRAY, marginBottom: 20, fontStyle: 'italic' },
  actions:    { flexDirection: 'row', gap: 12 },
  cancelBtn:  { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: 14, color: GRAY, fontWeight: '600' },
  saveBtn:    { flex: 1, padding: 14, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center' },
  saveText:   { fontSize: 14, color: '#FFF', fontWeight: '700' },
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
  abnormalBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: RED_LT },
  abnormalText:      { fontSize: 11, fontWeight: '700', color: RED_DK },
  normalBadge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#E1F5EE' },
  normalText:        { fontSize: 11, fontWeight: '700', color: '#085041' },
  pdfBadge:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F3FF' },
  pdfText:           { fontSize: 11, fontWeight: '700', color: PURPLE },
  reportName:        { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 8 },
  reportBottom:      { flexDirection: 'row', gap: 12, marginBottom: 6 },
  reportMeta:        { fontSize: 12, color: GRAY },
  reportDate:        { fontSize: 12, color: GRAY },
  testCountLine:     { fontSize: 11, color: GRAY, marginBottom: 10 },
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
  reviewHeading:     { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 4 },
  reviewSubhead:     { fontSize: 12, color: GRAY, marginBottom: 16, lineHeight: 17 },
  fieldLabel:        { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 6 },
  fieldHelp:         { fontSize: 11, color: GRAY, marginTop: -8, marginBottom: 12, fontStyle: 'italic' },
  input:             { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 13, fontSize: 14, color: DARK, marginBottom: 16, backgroundColor: '#FAFAFA' },
  panelCard:         { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F3F4F6' },
  panelTop:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  panelCatBadge:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  panelCatText:      { fontSize: 10, fontWeight: '700' },
  panelName:         { flex: 1, fontSize: 13, fontWeight: '600', color: DARK },
  panelStatus:       { fontSize: 12, fontWeight: '700' },
  panelMeta:         { fontSize: 11, color: GRAY, marginLeft: 4 },
  promoteNotice:     { backgroundColor: '#EEEDFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  promoteText:       { fontSize: 11, color: '#3C3489', lineHeight: 15 },
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
