import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Modal, TextInput, Alert, Switch, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getPrescriptions, addPrescriptions, deletePrescription, togglePrescription } from '../storage';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const RED     = '#EF4444';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';


const AI_SERVICE_URL = 'https://medrecord-ai-production.up.railway.app';
const USE_AI_SERVICE        = true;

const INDIAN_DRUGS = [
  'Metformin','Glycomet','Glucophage','Glipizide','Glimepiride','Amaryl',
  'Januvia','Sitagliptin','Vildagliptin','Galvus','Dapagliflozin','Insulin',
  'Lantus','Mixtard','Actrapid','Pioglitazone','Amlodipine','Norvasc','Stamlo',
  'Telmisartan','Telma','Losartan','Repace','Atenolol','Tenormin','Ramipril',
  'Cardace','Enalapril','Nifedipine','Nicardia','Bisoprolol','Concor','Olmesartan',
  'Atorvastatin','Lipitor','Atorva','Rosuvastatin','Rozavel','Crestor','Simvastatin',
  'Fenofibrate','Ezetimibe','Levothyroxine','Thyroxine','Eltroxin','Thyronorm',
  'Amoxicillin','Mox','Augmentin','Azithromycin','Zithromax','Azee','Ciprofloxacin',
  'Cifran','Doxycycline','Cefixime','Taxim','Cephalexin','Sporidex','Metronidazole',
  'Flagyl','Paracetamol','Crocin','Dolo','Ibuprofen','Brufen','Combiflam',
  'Diclofenac','Voveran','Aceclofenac','Zerodol','Naproxen','Tramadol','Etoricoxib',
  'Omeprazole','Omez','Pantoprazole','Pan','Pantocid','Rabeprazole','Razo',
  'Domperidone','Domstal','Ondansetron','Emset','Ranitidine','Rantac','Famotidine',
  'Calcium','Shelcal','Calcirol','Folic','Folvite','Becosules','Neurobion',
  'Methylcobalamin','Mecobalamin','Salbutamol','Asthalin','Montelukast','Montair',
  'Aspirin','Ecosprin','Clopidogrel','Clopilet','Warfarin','Furosemide','Lasix',
  'Spironolactone','Aldactone','Alprazolam','Alprax','Clonazepam','Diazepam','Zolpidem',
];

const FREQ_OPTIONS = [
  { code: 'OD',  label: 'Once daily' },
  { code: 'BD',  label: 'Twice daily' },
  { code: 'TDS', label: 'Three times' },
  { code: 'QID', label: 'Four times' },
  { code: 'HS',  label: 'At bedtime' },
  { code: 'SOS', label: 'As needed' },
  { code: 'AC',  label: 'Before meals' },
  { code: 'PC',  label: 'After meals' },
];

function findDrugName(text) {
  const upper = text.toUpperCase();
  for (const drug of INDIAN_DRUGS) {
    if (upper.includes(drug.toUpperCase())) return drug;
  }
  for (const drug of INDIAN_DRUGS) {
    if (upper.includes(drug.substring(0, 5).toUpperCase())) return drug;
  }
  const match = text.match(/([A-Z][a-z]{3,})\s+(\d+\s*(?:mg|mcg|ml|g|IU))/i);
  return match ? match[1] : '';
}

function findDosage(text) {
  const match = text.match(/(\d+\.?\d*\s*(?:mg|mcg|ml|g|IU))/i);
  return match ? match[1].trim() : '';
}

function findFrequency(text) {
  const upper = text.toUpperCase();
  const freqMap = [
    { codes: ['QID', 'Q.I.D', '4 TIMES', '1-1-1-1'], result: 'QID' },
    { codes: ['TDS', 'T.D.S', 'TID', '3 TIMES', '1-1-1'], result: 'TDS' },
    { codes: ['BD', 'B.D', 'BID', 'TWICE', '1-0-1'], result: 'BD' },
    { codes: ['HS', 'H.S', 'BEDTIME', 'NIGHT', '0-0-1'], result: 'HS' },
    { codes: ['SOS', 'S.O.S', 'AS NEEDED', 'PRN'], result: 'SOS' },
    { codes: ['AC', 'A.C', 'BEFORE MEAL'], result: 'AC' },
    { codes: ['PC', 'P.C', 'AFTER MEAL'], result: 'PC' },
    { codes: ['OD', 'O.D', 'ONCE', 'DAILY', '1-0-0'], result: 'OD' },
  ];
  for (const f of freqMap) {
    if (f.codes.some(c => upper.includes(c))) return f.result;
  }
  return 'OD';
}

function getFreqLabel(code) {
  return FREQ_OPTIONS.find(f => f.code === code)?.label || code;
}
// Convert any frequency notation (BD, TDS, 1-1-1, twice daily, etc.) to a canonical code (OD/BD/TDS/QID/HS/SOS/AC/PC)
function normalizeFreq(rawFreq) {
  if (!rawFreq) return 'OD';
  const upper = String(rawFreq).toUpperCase().trim();
  
  // Numeric Indian notation (most common cause of bug)
  if (upper === '1-1-1-1' || upper === '1/1/1/1')   return 'QID';
  if (upper === '1-1-1'   || upper === '1/1/1')      return 'TDS';
  if (upper === '1-0-1'   || upper === '1/0/1')      return 'BD';
  if (upper === '0-0-1'   || upper === '0/0/1')      return 'HS';
  if (upper === '1-0-0'   || upper === '1/0/0')      return 'OD';
  if (upper === '0-1-0'   || upper === '0/1/0')      return 'OD';
  
  // Standard medical abbreviations  
  if (['QID', 'Q.I.D', 'QDS', '4 TIMES'].includes(upper))            return 'QID';
  if (['TDS', 'TID', 'T.D.S', '3 TIMES', 'THREE TIMES'].includes(upper)) return 'TDS';
  if (['BD', 'BID', 'B.D', 'TWICE', 'TWICE DAILY'].includes(upper))  return 'BD';
  if (['HS', 'H.S', 'BEDTIME', 'AT BEDTIME', 'NIGHT'].includes(upper)) return 'HS';
  if (['SOS', 'S.O.S', 'PRN', 'AS NEEDED'].includes(upper))          return 'SOS';
  if (['AC', 'A.C', 'BEFORE MEALS', 'BEFORE FOOD'].includes(upper))  return 'AC';
  if (['PC', 'P.C', 'AFTER MEALS', 'AFTER FOOD'].includes(upper))    return 'PC';
  if (['OD', 'O.D', 'ONCE', 'DAILY', 'ONCE DAILY'].includes(upper))  return 'OD';
  
  // Already a valid code? pass through
  if (['OD','BD','TDS','QID','HS','SOS','AC','PC'].includes(upper)) return upper;
  
  return 'OD';
}
function getTimes(freq) {
  if (freq === 'BD')  return ['8:00 AM', '8:00 PM'];
  if (freq === 'TDS') return ['8:00 AM', '2:00 PM', '8:00 PM'];
  if (freq === 'QID') return ['8:00 AM', '12:00 PM', '4:00 PM', '8:00 PM'];
  if (freq === 'HS')  return ['10:00 PM'];
  return ['8:00 AM'];
}

function urgency(days) {
  if (days <= 3)  return { color: RED,    bg: '#FEF2F2', label: `${days}d left`,  tag: 'Refill now' };
  if (days <= 7)  return { color: ORANGE, bg: '#FFFBEB', label: `${days}d left`,  tag: 'Refill soon' };
  return            { color: GREEN,  bg: '#F0FDF4', label: `${days}d left`, tag: 'On track' };
}

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


function parseAllDrugs(text) {
  const lines  = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const upper = line.toUpperCase();
    let foundDrug = '';

    for (const drug of INDIAN_DRUGS) {
      if (upper.includes(drug.toUpperCase())) { foundDrug = drug; break; }
    }
    if (!foundDrug) {
      const genericMatch = line.match(/([A-Z][a-z]{3,})\s+(\d+\s*(?:mg|mcg|ml|g|IU))/i);
      if (genericMatch) foundDrug = genericMatch[1];
    }

    if (foundDrug) {
      const dosageMatch = line.match(/(\d+\.?\d*\s*(?:mg|mcg|ml|g|IU))/i);
      let dose = dosageMatch ? dosageMatch[1].trim() : '';
      if (!dose && lines[i + 1]) {
        const nextDose = lines[i + 1].match(/(\d+\.?\d*\s*(?:mg|mcg|ml|g|IU))/i);
        if (nextDose) dose = nextDose[1].trim();
      }
      const searchText = [line, lines[i+1] || '', lines[i+2] || ''].join(' ').toUpperCase();
      const freqMap = [
        { codes: ['QID','1-1-1-1'], result: 'QID' },
        { codes: ['TDS','TID','1-1-1'], result: 'TDS' },
        { codes: ['BD','BID','TWICE','1-0-1'], result: 'BD' },
        { codes: ['HS','BEDTIME','NIGHT','0-0-1'], result: 'HS' },
        { codes: ['SOS','PRN'], result: 'SOS' },
        { codes: ['AC','BEFORE MEAL'], result: 'AC' },
        { codes: ['PC','AFTER MEAL'], result: 'PC' },
        { codes: ['OD','ONCE','DAILY'], result: 'OD' },
      ];
      let freq = 'OD';
      for (const f of freqMap) {
        if (f.codes.some(c => searchText.includes(c))) { freq = f.result; break; }
      }
      const daysMatch = searchText.match(/(\d+)\s*(?:DAYS?|D\/S|DS)/i);
      const days = daysMatch ? daysMatch[1] : '30';

      if (!result.find(r => r.drug.toUpperCase() === foundDrug.toUpperCase())) {
        result.push({ drug: foundDrug, dose, freq, days });
      }
    }
  }
  return result;
}

// ── RxCard ────────────────────────────────────────────────────────────────────
function RxCard({ rx, onToggle, onPress, onDelete }) {
  const u = urgency(rx.daysLeft);
  return (
    <View style={s.rxCard}>
      <TouchableOpacity style={s.rxMain} onPress={onPress} activeOpacity={0.8}>
        <View style={[s.rxIconBox, { backgroundColor: rx.active ? TEAL_LT : '#F3F4F6' }]}>
          <Text style={{ fontSize: 22 }}>💊</Text>
        </View>
        <View style={s.rxInfo}>
          <Text style={s.rxDrug}>{rx.drug}</Text>
          <Text style={s.rxDose}>{rx.dose}  ·  {rx.freqLabel}</Text>
          <View style={s.timesRow}>
            {rx.times.map(t => (
              <View key={t} style={s.timeChip}>
                <Text style={s.timeText}>⏰ {t}</Text>
              </View>
            ))}
          </View>
        </View>
        <Switch
          value={rx.active}
          onValueChange={() => onToggle(rx.id)}
          trackColor={{ false: '#E5E7EB', true: TEAL_LT }}
          thumbColor={rx.active ? TEAL : '#9CA3AF'}
        />
      </TouchableOpacity>
      <View style={s.rxBottom}>
        <View style={[s.refillBar, { backgroundColor: u.bg }]}>
          <View style={[s.refillDot, { backgroundColor: u.color }]} />
          <Text style={[s.refillLabel, { color: u.color }]}>{u.label}  ·  {u.tag}</Text>
        </View>
        {rx.handwritten && <View style={s.hwBadge}><Text style={s.hwText}>✍️ Handwritten</Text></View>}
        <TouchableOpacity style={s.rxDeleteBtn} onPress={() => {
          Alert.alert('Delete', `Delete ${rx.drug}?`, [
            { text: 'Cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(rx.id) }
          ]);
        }}>
          <Text style={s.rxDeleteText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── OCR Results Review ────────────────────────────────────────────────────────
function OCRResultsModal({ visible, drugs, onConfirm, onCancel }) {
  const [edited, setEdited] = useState(drugs);
  useEffect(() => { setEdited(drugs); }, [drugs]);

  function updateDrug(i, field, value) {
    setEdited(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }
  function removeDrug(i) {
    setEdited(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.sheet, { maxHeight: '95%' }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Review Extracted Drugs</Text>
          <Text style={s.sheetSubtitle}>Found {drugs.length} medication(s) — review before saving</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {edited.map((drug, i) => (
              <View key={i} style={s.drugReviewCard}>
                <View style={s.drugReviewHeader}>
                  <Text style={s.drugReviewNum}>Drug {i + 1}</Text>
                  <TouchableOpacity onPress={() => removeDrug(i)}>
                    <Text style={s.drugRemove}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.fieldLabel}>Drug Name</Text>
                <TextInput style={s.input} value={drug.drug_name || drug.drug} onChangeText={v => updateDrug(i,'drug_name',v)} placeholder="Drug name" />
                <View style={s.drugRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>Dosage</Text>
                   <TextInput style={s.input} value={drug.dosage || drug.dose} onChangeText={v => updateDrug(i,'dosage',v)} placeholder="e.g. 500mg" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.fieldLabel}>Days</Text>
                    <TextInput style={s.input} value={drug.duration?.toString() || drug.days || '30'} onChangeText={v => updateDrug(i,'duration',v)} placeholder="30" keyboardType="numeric" />
                  </View>
                </View>
                <Text style={s.fieldLabel}>Frequency</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    {FREQ_OPTIONS.map(f => (
                      <TouchableOpacity key={f.code}
                        style={[s.freqChipSm, drug.freq === f.code && s.freqChipSmActive]}
                        onPress={() => updateDrug(i,'freq',f.code)}>
                        <Text style={[s.freqCodeSm, drug.freq === f.code && s.freqCodeSmActive]}>{f.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ))}
          </ScrollView>
          <View style={s.modalActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={() => onConfirm(edited)} disabled={edited.length === 0}>
              <Text style={s.saveText}>Save {edited.length} Drug{edited.length !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Add Rx Modal ──────────────────────────────────────────────────────────────
function AddRxModal({ visible, onClose, onSaveMultiple, memberId }) {
  const [step, setStep]             = useState(1);
  const [scanning, setScanning]     = useState(false);
  const [ocrDrugs, setOcrDrugs]     = useState([]);
  const [showReview, setShowReview] = useState(false);
  const [hwMode, setHwMode]         = useState(false);
  const [currentUri, setCurrentUri] = useState(null);
  const [drug, setDrug]             = useState('');
  const [dose, setDose]             = useState('');
  const [freq, setFreq]             = useState('OD');
  const [days, setDays]             = useState('30');

  async function processOCR(base64, uri, isHandwritten) {
    setScanning(true);
    setStep(2);
    try {
      let drugs = [];

      if (USE_AI_SERVICE) {
        try {
          const formData = new FormData();
          formData.append('file', { uri, type: 'image/jpeg', name: 'prescription.jpg' });
          const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/prescription`, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
          });
          const aiResult = await aiResponse.json();
         if (aiResult.success && aiResult.drugs?.length > 0) {
            // Skip review modal — directly save with type field intact
            const newRx = aiResult.drugs.map(d => {
            const drugType = d.type || 'outpatient';
              return {
                id:          Date.now().toString() + Math.random() + d.drug_name,
              drug:        d.drug_name || 'Unknown',
                dose:        d.dosage || 'See prescription',
                freq:        normalizeFreq(d.frequency),
                freqLabel:   getFreqLabel(normalizeFreq(d.frequency)),
                times:       getTimes(normalizeFreq(d.frequency)),
                daysLeft:    parseInt(d.duration) || 30,
                duration:    d.duration || '30 days',
                handwritten: isHandwritten,
                type:        drugType,
                notes:       d.notes || '',
                route:       d.route || 'oral',
                category:    d.category || 'Other',
                active:      drugType === 'discharge' || drugType === 'outpatient',
              };
            });
            const hospitalCount = newRx.filter(r => r.type === 'hospital').length;
            const activeCount   = newRx.length - hospitalCount;
            Alert.alert(
              '✅ AI Analysis Complete',
              `Found ${newRx.length} medication(s):\n\n💊 Take Now: ${activeCount}\n🏥 Hospital History: ${hospitalCount}\n\nConfidence: ${aiResult.avg_confidence}%`,
              [{ text: 'Save All', onPress: () => {
                onSaveMultiple(newRx);
                handleClose();
              }}]
            );
            setScanning(false);
            return;
          } else {
            const text = await runOCR(base64);
            drugs = parseAllDrugs(text);
          }
        } catch(e) {
          const text = await runOCR(base64);
          drugs = parseAllDrugs(text);
        }
      } else {
        const text = await runOCR(base64);
        drugs = parseAllDrugs(text);
      }

      if (drugs.length === 0) {
        Alert.alert('No drugs found', 'Could not detect medications. Please enter manually.', [
          { text: 'Enter Manually', onPress: () => { setStep(3); setScanning(false); } }
        ]);
        return;
      }
      setOcrDrugs(drugs);
      setShowReview(true);
    } catch(e) {
      Alert.alert('OCR failed', 'Could not read prescription. Please enter manually.');
      setStep(3);
    }
    setScanning(false);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.9 });
    if (!result.canceled) {
      setHwMode(true);
      setCurrentUri(result.assets[0].uri);
      await processOCR(result.assets[0].base64, result.assets[0].uri, true);
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow gallery access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.9 });
    if (!result.canceled) {
      setHwMode(false);
      setCurrentUri(result.assets[0].uri);
      await processOCR(result.assets[0].base64, result.assets[0].uri, false);
    }
  }

  async function pickFromWhatsApp() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Please allow gallery access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled) {
      setHwMode(false);
      setCurrentUri(result.assets[0].uri);
      Alert.alert('💬 WhatsApp Prescription', 'Running AI analysis...', [{ text: 'OK' }]);
      await processOCR(result.assets[0].base64, result.assets[0].uri, false);
    }
  }

async function pickPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setHwMode(false);
        setCurrentUri(asset.uri);
        setScanning(true);
        setStep(2);
        try {
          const formData = new FormData();
          formData.append('file', { uri: asset.uri, type: 'application/pdf', name: asset.name || 'prescription.pdf' });
          const aiResponse = await fetch(`${AI_SERVICE_URL}/ocr/prescription`, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
          });
          const aiResult = await aiResponse.json();
          if (aiResult.success && aiResult.drugs?.length > 0) {
            const newRx = aiResult.drugs.map(d => {
              const drugType = d.type || 'outpatient';
              return {
                id:          Date.now().toString() + Math.random() + d.drug_name,
                drug:        d.drug_name || 'Unknown',
                dose:        d.dosage || 'See prescription',
                freq:        normalizeFreq(d.frequency),
                freqLabel:   getFreqLabel(normalizeFreq(d.frequency)),
                times:       getTimes(normalizeFreq(d.frequency)),
                daysLeft:    parseInt(d.duration) || 30,
                duration:    d.duration || '30 days',
                handwritten: false,
                type:        drugType,
                notes:       d.notes || '',
                route:       d.route || 'oral',
                category:    d.category || 'Other',
                active:      drugType === 'discharge' || drugType === 'outpatient',
              };
            });
            const hospitalCount = newRx.filter(r => r.type === 'hospital').length;
            const activeCount   = newRx.length - hospitalCount;
            Alert.alert(
              '✅ PDF Analyzed',
              `Found ${newRx.length} medication(s):\n\n💊 Take Now: ${activeCount}\n🏥 Hospital History: ${hospitalCount}\n\nConfidence: ${aiResult.avg_confidence}%`,
              [{ text: 'Save All', onPress: () => { onSaveMultiple(newRx); handleClose(); } }]
            );
          } else {
            Alert.alert('No drugs found in PDF', 'Please enter manually.', [
              { text: 'Enter Manually', onPress: () => { setScanning(false); setStep(3); } }
            ]);
          }
        } catch(e) {
          Alert.alert('PDF processing failed', 'Could not read PDF. Please enter manually.', [
            { text: 'Enter Manually', onPress: () => { setScanning(false); setStep(3); } }
          ]);
        }
        setScanning(false);
      }
    } catch { Alert.alert('Error', 'Could not open PDF.'); }
  }

  function handleConfirmOCR(confirmedDrugs) {
    setShowReview(false);
    const newRx = confirmedDrugs.map(d => {
      const drugType = d.type || 'outpatient';
      return {
        id:          Date.now().toString() + Math.random() + d.drug_name,
        drug:        d.drug_name || d.drug || 'Unknown',
        dose:        d.dosage || d.dose || 'See prescription',
        freq:        normalizeFreq(d.frequency || d.freq),
        freqLabel:   getFreqLabel(normalizeFreq(d.frequency || d.freq)),
        times:       getTimes(normalizeFreq(d.frequency || d.freq)),
        daysLeft:    parseInt(d.duration) || 30,
        duration:    d.duration || '30 days',
        handwritten: hwMode,
        type:        drugType,
        notes:       d.notes || '',
        route:       d.route || 'oral',
        category:    d.category || 'Other',
        active:      drugType === 'discharge' || drugType === 'outpatient',
      };
    });
    onSaveMultiple(newRx);
    handleClose();
  }
  

  function handleManualSave() {
    if (!drug.trim() || !dose.trim()) { Alert.alert('Missing info', 'Please enter drug name and dosage.'); return; }
    onSaveMultiple([{
      id: Date.now().toString(), drug: drug.trim(), dose: dose.trim(),
      freq, freqLabel: getFreqLabel(freq), times: getTimes(freq),
      daysLeft: parseInt(days) || 30, handwritten: false, active: true,
    }]);
    handleClose();
  }

  function handleClose() {
    setStep(1); setScanning(false); setOcrDrugs([]); setShowReview(false);
    setHwMode(false); setCurrentUri(null);
    setDrug(''); setDose(''); setFreq('OD'); setDays('30');
    onClose();
  }

  return (
    <>
      <Modal visible={visible && !showReview} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Add Prescription</Text>

            {/* Step 1 — choose method */}
            {step === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={s.sheetSubtitle}>How would you like to add this prescription?</Text>
                {[
                  { emoji: '✍️', title: 'Photograph Handwritten', desc: 'Camera reads ALL drugs automatically',         color: TEAL_LT,   action: takePhoto },
                  { emoji: '💬', title: 'From WhatsApp',          desc: 'Pick a prescription image from WhatsApp',     color: '#E7F8EE', action: pickFromWhatsApp },
                  { emoji: '🖼️', title: 'Upload from Gallery',    desc: 'Select a photo of the prescription',          color: '#F0FDF4', action: pickFromGallery },
                  { emoji: '📄', title: 'Upload PDF',             desc: 'Select a PDF prescription file',              color: '#F5F3FF', action: pickPDF },
                  { emoji: '⌨️', title: 'Enter Manually',         desc: 'Type the prescription details yourself',      color: '#F3F4F6', action: () => setStep(3) },
                ].map((m, i) => (
                  <TouchableOpacity key={i} style={s.methodBtn} onPress={m.action} activeOpacity={0.8}>
                    <View style={[s.methodIconBox, { backgroundColor: m.color }]}>
                      <Text style={{ fontSize: 24 }}>{m.emoji}</Text>
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

            {/* Step 2 — scanning */}
            {step === 2 && scanning && (
              <View style={s.scanningBox}>
                <ActivityIndicator size="large" color={TEAL} />
                <Text style={s.scanningText}>Reading prescription...</Text>
                <Text style={s.scanningHint}>Detecting all drugs, dosages and frequencies</Text>
              </View>
            )}

            {/* Step 3 — manual entry */}
            {step === 3 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={s.sheetSubtitle}>Enter prescription details manually</Text>
                <Text style={s.fieldLabel}>Drug Name</Text>
                <TextInput style={s.input} placeholder="e.g. Metformin" value={drug} onChangeText={setDrug} />
                <Text style={s.fieldLabel}>Dosage</Text>
                <TextInput style={s.input} placeholder="e.g. 500mg" value={dose} onChangeText={setDose} />
                <Text style={s.fieldLabel}>Frequency</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {FREQ_OPTIONS.map(f => (
                      <TouchableOpacity key={f.code}
                        style={[s.freqChip, freq === f.code && s.freqChipActive]}
                        onPress={() => setFreq(f.code)}>
                        <Text style={[s.freqCode, freq === f.code && s.freqCodeActive]}>{f.code}</Text>
                        <Text style={[s.freqDesc, freq === f.code && s.freqDescActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={s.fieldLabel}>Days Supply</Text>
                <TextInput style={s.input} placeholder="e.g. 30" value={days} onChangeText={setDays} keyboardType="numeric" />
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setStep(1)}>
                    <Text style={s.cancelText}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={handleManualSave}>
                    <Text style={s.saveText}>Save</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            <TouchableOpacity style={s.closeX} onPress={handleClose}>
              <Text style={s.closeXText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <OCRResultsModal
        visible={showReview}
        drugs={ocrDrugs}
        onConfirm={handleConfirmOCR}
        onCancel={() => { setShowReview(false); setStep(1); setScanning(false); }}
      />
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PrescriptionsScreen({ activeMember }) {
  const [rxList, setRxList] = useState([]);
  const [modal, setModal]   = useState(false);
  const [tab, setTab]       = useState('current');
  const [showHospital, setShowHospital] = useState(false);
  const memberId = activeMember?.id || 'default';

  useEffect(() => { loadPrescriptions(); }, [activeMember]);

  async function loadPrescriptions() {
    const saved = await getPrescriptions(memberId);
    setRxList(saved);
  }

  async function handleSaveMultiple(newRxList) {
    const updated = await addPrescriptions(newRxList, memberId);
    setRxList(updated);
  }

  async function handleToggle(id) {
    const updated = await togglePrescription(id, memberId);
    setRxList(updated);
  }

  async function handleDelete(id) {
    const updated = await deletePrescription(id, memberId);
    setRxList(updated);
  }

  // ── SMART CATEGORIZATION ──────────────────────────────
  const currentMeds  = rxList.filter(r => 
    (r.type === 'discharge' || r.type === 'outpatient' || !r.type) && r.active !== false
  );
  const hospitalMeds = rxList.filter(r => r.type === 'hospital');
  const inactiveMeds = rxList.filter(r => 
    (r.type === 'discharge' || r.type === 'outpatient' || !r.type) && r.active === false
  );

  const refillCount = currentMeds.filter(m => (m.daysLeft || 30) <= 7).length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>My Medications</Text>
          <Text style={s.subtitle}>{currentMeds.length} active  ·  {hospitalMeds.length} hospital records</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setModal(true)}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {refillCount > 0 && (
        <View style={s.refillAlert}>
          <Text style={s.refillAlertText}>⚠️  {refillCount} medication{refillCount > 1 ? 's' : ''} need refill soon</Text>
        </View>
      )}

      <ScrollView style={s.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>

        {/* ── TAKE NOW SECTION ── */}
        <View style={s.sectionHeader}>
          <View style={[s.sectionDot, { backgroundColor: GREEN }]} />
          <Text style={s.sectionTitle}>💊 Take Now</Text>
          <Text style={s.sectionCount}>{currentMeds.length}</Text>
        </View>

        {currentMeds.length === 0 && (
          <View style={s.emptyMini}>
            <Text style={s.emptyMiniText}>No active medications. Tap + Add to start tracking.</Text>
          </View>
        )}

        {currentMeds.map(rx => (
          <RxCard
            key={rx.id}
            rx={rx}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onPress={() => Alert.alert(
              rx.drug,
              `Dose: ${rx.dose}\nFrequency: ${rx.freqLabel}\nTimes: ${rx.times.join(', ')}\nDuration: ${rx.duration || '30 days'}\nRoute: ${rx.route || 'Oral'}\n\nNotes: ${rx.notes || 'None'}`
            )}
          />
        ))}

        {/* ── INACTIVE / PAUSED ── */}
        {inactiveMeds.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <View style={[s.sectionDot, { backgroundColor: GRAY }]} />
              <Text style={s.sectionTitle}>⏸ Paused</Text>
              <Text style={s.sectionCount}>{inactiveMeds.length}</Text>
            </View>
            {inactiveMeds.map(rx => (
              <RxCard
                key={rx.id}
                rx={rx}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onPress={() => Alert.alert(rx.drug, `Currently paused.\nDose: ${rx.dose}`)}
              />
            ))}
          </>
        )}

        {/* ── HOSPITAL HISTORY ── */}
        {hospitalMeds.length > 0 && (
          <>
            <TouchableOpacity
              style={[s.sectionHeader, s.sectionHeaderClickable]}
              onPress={() => setShowHospital(!showHospital)}
              activeOpacity={0.7}
            >
              <View style={[s.sectionDot, { backgroundColor: '#7C3AED' }]} />
              <Text style={s.sectionTitle}>🏥 Hospital History</Text>
              <Text style={s.sectionCount}>{hospitalMeds.length}</Text>
              <Text style={s.sectionToggle}>{showHospital ? '▲ Hide' : '▼ Show'}</Text>
            </TouchableOpacity>

            {showHospital && (
              <>
                <View style={s.hospitalNote}>
                  <Text style={s.hospitalNoteText}>
                    These were given during hospital admission. No reminders set — for reference only.
                  </Text>
                </View>
                {hospitalMeds.map(rx => (
                  <HospitalRxCard
                    key={rx.id}
                    rx={rx}
                    onDelete={handleDelete}
                    onPress={() => Alert.alert(
                      rx.drug,
                      `Type: Hospital medication\nDose: ${rx.dose}\nRoute: ${rx.route || 'IV'}\nNotes: ${rx.notes || 'None'}\n\nThis was given during your hospital stay.`
                    )}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      <AddRxModal
        visible={modal}
        onClose={() => setModal(false)}
        onSaveMultiple={handleSaveMultiple}
        memberId={memberId}
      />
    </SafeAreaView>
  );
}

// ── Hospital Rx Card (read-only style) ──────────────────────────────────────
function HospitalRxCard({ rx, onPress, onDelete }) {
  return (
    <TouchableOpacity style={s.hospitalCard} onPress={onPress} activeOpacity={0.7}>
      <View style={s.hospitalIconBox}>
        <Text style={{ fontSize: 18 }}>💉</Text>
      </View>
      <View style={s.hospitalInfo}>
        <Text style={s.hospitalDrug}>{rx.drug}</Text>
        <Text style={s.hospitalDose}>{rx.dose}  ·  {rx.route?.toUpperCase() || 'IV'}</Text>
        {rx.notes && <Text style={s.hospitalNotes}>📝 {rx.notes}</Text>}
      </View>
      <TouchableOpacity onPress={() => {
        Alert.alert('Delete', `Remove ${rx.drug} from hospital history?`, [
          { text: 'Cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete(rx.id) }
        ]);
      }}>
        <Text style={s.hospitalDelete}>🗑️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
sectionHeader:      { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12, gap: 8 },
  sectionHeaderClickable: { paddingVertical: 4 },
  sectionDot:         { width: 10, height: 10, borderRadius: 5 },
  sectionTitle:       { fontSize: 15, fontWeight: '800', color: DARK, flex: 1 },
  sectionCount:       { fontSize: 13, fontWeight: '700', color: GRAY, backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionToggle:      { fontSize: 12, color: TEAL, fontWeight: '700', marginLeft: 8 },
  emptyMini:          { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  emptyMiniText:      { fontSize: 13, color: GRAY, textAlign: 'center' },
  hospitalNote:       { backgroundColor: '#F5F3FF', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  hospitalNoteText:   { fontSize: 12, color: '#5B21B6', lineHeight: 17 },
  hospitalCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5FF', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: '#E9D5FF' },
  hospitalIconBox:    { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
  hospitalInfo:       { flex: 1 },
  hospitalDrug:       { fontSize: 14, fontWeight: '700', color: DARK },
  hospitalDose:       { fontSize: 12, color: GRAY, marginTop: 2 },
  hospitalNotes:      { fontSize: 11, color: '#7C3AED', marginTop: 3 },
  hospitalDelete:     { fontSize: 16, padding: 8 },
  safe:            { flex: 1, backgroundColor: BG },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title:           { fontSize: 22, fontWeight: '800', color: DARK },
  subtitle:        { fontSize: 13, color: GRAY, marginTop: 2 },
  addBtn:          { backgroundColor: GREEN, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10, elevation: 3, shadowColor: GREEN, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  addBtnText:      { color: '#FFF', fontWeight: '700', fontSize: 14 },
  refillAlert:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  refillAlertText: { fontSize: 13, color: '#92400E', fontWeight: '500' },
  tabRow:          { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4, marginBottom: 16 },
  tabBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive:    { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  tabText:         { fontSize: 13, color: GRAY, fontWeight: '500' },
  tabTextActive:   { color: DARK, fontWeight: '700' },
  list:            { flex: 1 },
  rxCard:          { backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, overflow: 'hidden' },
  rxMain:          { padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rxIconBox:       { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rxInfo:          { flex: 1 },
  rxDrug:          { fontSize: 16, fontWeight: '800', color: DARK },
  rxDose:          { fontSize: 13, color: GRAY, marginTop: 3 },
  timesRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  timeChip:        { backgroundColor: TEAL_LT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  timeText:        { fontSize: 11, color: TEAL, fontWeight: '600' },
  rxBottom:        { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16, paddingBottom: 12 },
  refillBar:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 6, flex: 1 },
  refillDot:       { width: 6, height: 6, borderRadius: 3 },
  refillLabel:     { fontSize: 12, fontWeight: '600' },
  hwBadge:         { backgroundColor: '#F5F3FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  hwText:          { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  rxDeleteBtn:     { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  rxDeleteText:    { fontSize: 14 },
  empty:           { alignItems: 'center', paddingTop: 60 },
  emptyEmoji:      { fontSize: 52, marginBottom: 14 },
  emptyTitle:      { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 6 },
  emptyText:       { fontSize: 14, color: GRAY },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, maxHeight: '92%' },
  sheetHandle:     { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:      { fontSize: 20, fontWeight: '800', color: DARK, marginBottom: 4 },
  sheetSubtitle:   { fontSize: 14, color: GRAY, marginBottom: 16 },
  methodBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  methodIconBox:   { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  methodInfo:      { flex: 1 },
  methodTitle:     { fontSize: 14, fontWeight: '700', color: DARK },
  methodDesc:      { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 17 },
  methodArrow:     { fontSize: 22, color: '#D1D5DB' },
  scanningBox:     { alignItems: 'center', paddingVertical: 40 },
  scanningText:    { fontSize: 16, fontWeight: '700', color: DARK, marginTop: 16 },
  scanningHint:    { fontSize: 13, color: GRAY, marginTop: 6 },
  fieldLabel:      { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 8 },
  input:           { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 14, color: DARK, marginBottom: 16, backgroundColor: '#FAFAFA' },
  freqChip:        { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', minWidth: 80 },
  freqChipActive:  { backgroundColor: TEAL_LT, borderColor: TEAL },
  freqCode:        { fontSize: 14, fontWeight: '800', color: GRAY },
  freqCodeActive:  { color: TEAL },
  freqDesc:        { fontSize: 10, color: GRAY, marginTop: 2 },
  freqDescActive:  { color: TEAL },
  freqChipSm:      { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', minWidth: 50 },
  freqChipSmActive:{ backgroundColor: TEAL_LT, borderColor: TEAL },
  freqCodeSm:      { fontSize: 12, fontWeight: '700', color: GRAY },
  freqCodeSmActive:{ color: TEAL },
  drugReviewCard:  { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  drugReviewHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  drugReviewNum:   { fontSize: 13, fontWeight: '700', color: TEAL },
  drugRemove:      { fontSize: 12, color: RED, fontWeight: '600' },
  drugRow:         { flexDirection: 'row' },
  modalActions:    { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:       { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText:      { fontSize: 14, color: GRAY, fontWeight: '600' },
  saveBtn:         { flex: 1, padding: 15, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center' },
  saveText:        { fontSize: 14, color: '#FFF', fontWeight: '700' },
  closeX:          { position: 'absolute', top: 20, right: 20, padding: 8 },
  closeXText:      { fontSize: 18, color: '#9CA3AF' },
});