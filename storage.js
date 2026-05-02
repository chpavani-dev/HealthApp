import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Keys ─────────────────────────────────────────────────────────────────────
const key = (type, memberId) => `${type}_${memberId || 'default'}`;

// ── Reports ──────────────────────────────────────────────────────────────────
export async function getReports(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('reports', memberId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function saveReports(reports, memberId) {
  try {
    await AsyncStorage.setItem(key('reports', memberId), JSON.stringify(reports));
  } catch(e) { console.log('Save reports error:', e); }
}

export async function addReport(report, memberId) {
  const existing = await getReports(memberId);
  const updated  = [report, ...existing];
  await saveReports(updated, memberId);
  return updated;
}

export async function deleteReport(reportId, memberId) {
  const existing = await getReports(memberId);
  const updated  = existing.filter(r => r.id !== reportId);
  await saveReports(updated, memberId);
  return updated;
}

// ── Prescriptions ─────────────────────────────────────────────────────────────
export async function getPrescriptions(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('prescriptions', memberId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function savePrescriptions(prescriptions, memberId) {
  try {
    await AsyncStorage.setItem(key('prescriptions', memberId), JSON.stringify(prescriptions));
  } catch(e) { console.log('Save prescriptions error:', e); }
}

export async function addPrescriptions(newRxList, memberId) {
  const existing = await getPrescriptions(memberId);
  const updated  = [...newRxList, ...existing];
  await savePrescriptions(updated, memberId);
  return updated;
}

export async function deletePrescription(rxId, memberId) {
  const existing = await getPrescriptions(memberId);
  const updated  = existing.filter(r => r.id !== rxId);
  await savePrescriptions(updated, memberId);
  return updated;
}

export async function togglePrescription(rxId, memberId) {
  const existing = await getPrescriptions(memberId);
  const updated  = existing.map(r => r.id === rxId ? { ...r, active: !r.active } : r);
  await savePrescriptions(updated, memberId);
  return updated;
}

// ── Timeline values ───────────────────────────────────────────────────────────
export async function getTimelineValues(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('timeline', memberId));
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

export async function saveTimelineValues(values, memberId) {
  try {
    await AsyncStorage.setItem(key('timeline', memberId), JSON.stringify(values));
  } catch(e) { console.log('Save timeline error:', e); }
}

export async function addTimelineEntry(metricId, value, date, memberId) {
  const existing = await getTimelineValues(memberId);
  if (!existing[metricId]) existing[metricId] = [];
  // Avoid duplicate dates
  const filtered = existing[metricId].filter(e => e.date !== date);
  existing[metricId] = [...filtered, { date, value }]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  await saveTimelineValues(existing, memberId);
  return existing;
}

// ── OCR Value Parser ──────────────────────────────────────────────────────────
// Extracts health metric values from raw OCR text and saves to timeline
export async function parseAndSaveLabValues(rawText, date, memberId) {
  const metrics = [
    { id: 'hba1c',       patterns: ['hba1c', 'hb a1c', 'glycated', 'glycosylated'],        unit: '%',      multiplier: 1 },
    { id: 'glucose',     patterns: ['fasting glucose', 'fasting blood glucose', 'fbg', 'fbs'], unit: 'mg/dL', multiplier: 1 },
    { id: 'hb',          patterns: ['haemoglobin', 'hemoglobin', 'hb ', 'hgb'],             unit: 'g/dL',  multiplier: 1 },
    { id: 'tsh',         patterns: ['tsh', 'thyroid stimulating'],                           unit: 'mIU/L', multiplier: 1 },
    { id: 'cholesterol', patterns: ['total cholesterol', 'cholesterol total', 'chol'],       unit: 'mg/dL', multiplier: 1 },
    { id: 'ldl',         patterns: ['ldl', 'low density', 'ldl cholesterol'],                unit: 'mg/dL', multiplier: 1 },
    { id: 'hdl',         patterns: ['hdl', 'high density', 'hdl cholesterol'],               unit: 'mg/dL', multiplier: 1 },
    { id: 'triglycerides', patterns: ['triglycerides', 'triglyceride', 'tgl', 'trig'],      unit: 'mg/dL', multiplier: 1 },
    { id: 'creatinine',  patterns: ['creatinine', 'serum creatinine', 'creat'],              unit: 'mg/dL', multiplier: 1 },
    { id: 'urea',        patterns: ['blood urea', 'urea', 'bun'],                            unit: 'mg/dL', multiplier: 1 },
    { id: 'platelet',    patterns: ['platelet', 'plt', 'thrombocyte'],                       unit: 'lakh/μL', multiplier: 1 },
    { id: 'wbc',         patterns: ['wbc', 'white blood', 'leucocyte', 'leukocyte'],         unit: 'cells/μL', multiplier: 1 },
  ];

  const lines      = rawText.toLowerCase().split('\n');
  const extracted  = {};
  const today      = date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  for (const metric of metrics) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchesMetric = metric.patterns.some(p => line.includes(p));

      if (matchesMetric) {
        // Look for a number on this line or the next 2 lines
        const searchText = lines.slice(i, i + 3).join(' ');
        const numMatch   = searchText.match(/(\d+\.?\d*)/);

        if (numMatch) {
          const value = parseFloat(numMatch[1]);
          // Sanity check — ignore obviously wrong values
          if (isValidValue(metric.id, value)) {
            extracted[metric.id] = value;
            await addTimelineEntry(metric.id, value, today, memberId);
          }
        }
        break;
      }
    }
  }

  return extracted;
}

function isValidValue(metricId, value) {
  const ranges = {
    hba1c:        { min: 3,    max: 20   },
    glucose:      { min: 30,   max: 600  },
    hb:           { min: 4,    max: 20   },
    tsh:          { min: 0.01, max: 100  },
    cholesterol:  { min: 50,   max: 500  },
    ldl:          { min: 20,   max: 400  },
    hdl:          { min: 10,   max: 150  },
    triglycerides:{ min: 30,   max: 1000 },
    creatinine:   { min: 0.1,  max: 20   },
    urea:         { min: 5,    max: 200  },
    platelet:     { min: 10,   max: 1000 },
    wbc:          { min: 1000, max: 50000},
  };
  const range = ranges[metricId];
  if (!range) return true;
  return value >= range.min && value <= range.max;
}