import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys
const key = (type, memberId) => `${type}_${memberId || 'default'}`;

// Default Tier 1 metrics (12)
export const DEFAULT_TRACKED_METRICS = [
  'hba1c', 'glucose', 'hb', 'tsh', 'cholesterol',
  'ldl', 'hdl', 'triglycerides', 'creatinine',
  'urea', 'platelet', 'wbc',
];

// Reports
export async function getReports(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('reports', memberId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function saveReports(reports, memberId) {
  try {
    await AsyncStorage.setItem(key('reports', memberId), JSON.stringify(reports));
  } catch (e) { console.log('Save reports error:', e); }
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

// Prescriptions
export async function getPrescriptions(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('prescriptions', memberId));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function savePrescriptions(prescriptions, memberId) {
  try {
    await AsyncStorage.setItem(key('prescriptions', memberId), JSON.stringify(prescriptions));
  } catch (e) { console.log('Save prescriptions error:', e); }
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

// Timeline values
export async function getTimelineValues(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('timeline', memberId));
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

export async function saveTimelineValues(values, memberId) {
  try {
    await AsyncStorage.setItem(key('timeline', memberId), JSON.stringify(values));
  } catch (e) { console.log('Save timeline error:', e); }
}

export async function addTimelineEntry(metricId, value, date, memberId) {
  const existing = await getTimelineValues(memberId);
  if (!existing[metricId]) existing[metricId] = [];
  const filtered = existing[metricId].filter(e => e.date !== date);
  existing[metricId] = [...filtered, { date, value }]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  await saveTimelineValues(existing, memberId);
  return existing;
}

// Legacy regex OCR parser (kept for fallback)
export async function parseAndSaveLabValues(rawText, date, memberId) {
  const metrics = [
    { id: 'hba1c',         patterns: ['hba1c', 'hb a1c', 'glycated', 'glycosylated'],          unit: '%' },
    { id: 'glucose',       patterns: ['fasting glucose', 'fasting blood glucose', 'fbg', 'fbs'], unit: 'mg/dL' },
    { id: 'hb',            patterns: ['haemoglobin', 'hemoglobin', 'hb ', 'hgb'],              unit: 'g/dL' },
    { id: 'tsh',           patterns: ['tsh', 'thyroid stimulating'],                            unit: 'mIU/L' },
    { id: 'cholesterol',   patterns: ['total cholesterol', 'cholesterol total', 'chol'],        unit: 'mg/dL' },
    { id: 'ldl',           patterns: ['ldl', 'low density', 'ldl cholesterol'],                 unit: 'mg/dL' },
    { id: 'hdl',           patterns: ['hdl', 'high density', 'hdl cholesterol'],                unit: 'mg/dL' },
    { id: 'triglycerides', patterns: ['triglycerides', 'triglyceride', 'tgl', 'trig'],          unit: 'mg/dL' },
    { id: 'creatinine',    patterns: ['creatinine', 'serum creatinine', 'creat'],               unit: 'mg/dL' },
    { id: 'urea',          patterns: ['blood urea', 'urea', 'bun'],                             unit: 'mg/dL' },
    { id: 'platelet',      patterns: ['platelet', 'plt', 'thrombocyte'],                        unit: 'lakh/uL' },
    { id: 'wbc',           patterns: ['wbc', 'white blood', 'leucocyte', 'leukocyte'],          unit: 'cells/uL' },
  ];

  const lines      = rawText.toLowerCase().split('\n');
  const extracted  = {};
  const today      = date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  for (const metric of metrics) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchesMetric = metric.patterns.some(p => line.includes(p));
      if (matchesMetric) {
        const searchText = lines.slice(i, i + 3).join(' ');
        const numMatch   = searchText.match(/(\d+\.?\d*)/);
        if (numMatch) {
          const value = parseFloat(numMatch[1]);
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
    hba1c:         { min: 3,    max: 20    },
    glucose:       { min: 30,   max: 600   },
    hb:            { min: 4,    max: 20    },
    tsh:           { min: 0.01, max: 100   },
    cholesterol:   { min: 50,   max: 500   },
    ldl:           { min: 20,   max: 400   },
    hdl:           { min: 10,   max: 150   },
    triglycerides: { min: 30,   max: 1000  },
    creatinine:    { min: 0.1,  max: 20    },
    urea:          { min: 5,    max: 200   },
    platelet:      { min: 10,   max: 1000  },
    wbc:           { min: 1000, max: 50000 },
  };
  const range = ranges[metricId];
  if (!range) return true;
  return value >= range.min && value <= range.max;
}

// ====================================================================
// Tier 1/2 Tracked metrics + AI Lab save
// ====================================================================

// Test name to metricId mapping
const NAME_TO_METRIC_ID = {
  'hba1c':                 'hba1c',
  'hemoglobin':            'hb',
  'haemoglobin':           'hb',
  'glucose':               'glucose',
  'fasting glucose':       'glucose',
  'post prandial glucose': 'glucose_pp',
  'random glucose':        'glucose_random',
  'tsh':                   'tsh',
  't3':                    't3',
  't4':                    't4',
  'free t3':               'free_t3',
  'free t4':               'free_t4',
  'total cholesterol':     'cholesterol',
  'ldl cholesterol':       'ldl',
  'hdl cholesterol':       'hdl',
  'triglycerides':         'triglycerides',
  'creatinine':            'creatinine',
  'urea':                  'urea',
  'bun':                   'bun',
  'uric acid':             'uric_acid',
  'vitamin d':             'vitamin_d',
  'vitamin b12':           'vitamin_b12',
  'wbc':                   'wbc',
  'rbc':                   'rbc',
  'platelets':             'platelet',
  'esr':                   'esr',
  'crp':                   'crp',
  'sgot (ast)':            'sgot',
  'sgpt (alt)':            'sgpt',
  'bilirubin total':       'bilirubin',
  'sodium':                'sodium',
  'potassium':             'potassium',
};

export const METRIC_LABELS = {
  hba1c:          'HbA1c',
  hb:             'Hemoglobin',
  glucose:        'Fasting Glucose',
  glucose_pp:     'Post-Prandial Glucose',
  glucose_random: 'Random Glucose',
  tsh:            'TSH',
  t3:             'T3',
  t4:             'T4',
  free_t3:        'Free T3',
  free_t4:        'Free T4',
  cholesterol:    'Total Cholesterol',
  ldl:            'LDL Cholesterol',
  hdl:            'HDL Cholesterol',
  triglycerides:  'Triglycerides',
  creatinine:     'Creatinine',
  urea:           'Urea',
  bun:            'BUN',
  uric_acid:      'Uric Acid',
  vitamin_d:      'Vitamin D',
  vitamin_b12:    'Vitamin B12',
  wbc:            'WBC',
  rbc:            'RBC',
  platelet:       'Platelets',
  esr:            'ESR',
  crp:            'CRP',
  sgot:           'SGOT (AST)',
  sgpt:           'SGPT (ALT)',
  bilirubin:      'Bilirubin Total',
  sodium:         'Sodium',
  potassium:      'Potassium',
};

function canonicalToMetricId(canonicalName) {
  if (!canonicalName) return null;
  const lookupKey = canonicalName.trim().toLowerCase();
  if (NAME_TO_METRIC_ID[lookupKey]) return NAME_TO_METRIC_ID[lookupKey];
  return lookupKey.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Tracked metrics (per member, with auto-promotion)
export async function getTrackedMetrics(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('tracked_metrics', memberId));
    if (data) return JSON.parse(data);
  } catch { }
  return [...DEFAULT_TRACKED_METRICS];
}

export async function saveTrackedMetrics(metricIds, memberId) {
  try {
    await AsyncStorage.setItem(key('tracked_metrics', memberId), JSON.stringify(metricIds));
  } catch (e) { console.log('Save tracked metrics error:', e); }
}

export async function addTrackedMetric(metricId, memberId) {
  if (!metricId) return null;
  const existing = await getTrackedMetrics(memberId);
  if (existing.includes(metricId)) return existing;
  const updated = [...existing, metricId];
  await saveTrackedMetrics(updated, memberId);
  return updated;
}

export async function removeTrackedMetric(metricId, memberId) {
  const existing = await getTrackedMetrics(memberId);
  const updated  = existing.filter(m => m !== metricId);
  await saveTrackedMetrics(updated, memberId);
  return updated;
}

export async function getAvailableMetrics(memberId) {
  const timeline = await getTimelineValues(memberId);
  const tracked  = await getTrackedMetrics(memberId);
  const trackedSet = new Set(tracked);

  const available = [];
  for (const [metricId, entries] of Object.entries(timeline)) {
    if (trackedSet.has(metricId)) continue;
    if (!entries || entries.length === 0) continue;
    const latest = entries[entries.length - 1];
    available.push({
      metricId,
      label: METRIC_LABELS[metricId] || metricId,
      readingCount: entries.length,
      latestValue: latest.value,
      latestDate: latest.date,
    });
  }
  available.sort((a, b) => b.readingCount - a.readingCount);
  return available;
}

// ====================================================================
// NEW v1.7: Duplicate detection for lab reports
// ====================================================================
// Helper used by the upload flow to detect when a user uploads the same
// report they've already saved. Matches on (lab + date + panel_name).
//
// Returns { allDuplicate, totalPanels, duplicateCount, matches } where:
//   allDuplicate    = true ONLY if every panel in `parsed` matches an
//                     existing saved report
//   matches         = array of objects describing which panels matched
//                     which existing reports
//
// This intentionally does NOT delete or modify any data. The caller
// decides what to do (e.g., block the upload and show a popup).
export async function findExactDuplicateReports(parsed, memberId, overrides = {}) {
  if (!parsed || !Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    return { allDuplicate: false, totalPanels: 0, duplicateCount: 0, matches: [] };
  }

  const labName    = (overrides.labName    || parsed.lab_name    || '').trim().toLowerCase();
  const reportDate = (overrides.reportDate || parsed.report_date || '').trim();

  // No usable lab or date means we can't be confident about duplicates
  if (!labName || !reportDate) {
    return { allDuplicate: false, totalPanels: parsed.panels.length, duplicateCount: 0, matches: [] };
  }

  const existing = await getReports(memberId);
  const matches  = [];

  for (const panel of parsed.panels) {
    const panelName = (panel.panel_name || '').trim().toLowerCase();
    if (!panelName) continue;

    const matchedReport = existing.find(r =>
      (r.lab || '').trim().toLowerCase() === labName &&
      (r.date || '').trim() === reportDate &&
      (r.name || '').trim().toLowerCase() === panelName
    );

    if (matchedReport) {
      matches.push({
        panelName: panel.panel_name,
        existingReportId: matchedReport.id,
        existingReportName: matchedReport.name,
      });
    }
  }

  const totalPanels    = parsed.panels.length;
  const duplicateCount = matches.length;
  const allDuplicate   = duplicateCount === totalPanels && totalPanels > 0;

  return { allDuplicate, totalPanels, duplicateCount, matches };
}

// ====================================================================
// Duplicate detection for prescriptions
// ====================================================================
// Match on: drug name (lowercase, trimmed) + prescription date
// Returns { allDuplicate, totalDrugs, duplicateCount, matches }
// Mirrors findExactDuplicateReports for symmetric behavior.
export async function findExactDuplicatePrescriptions(parsedDrugs, prescriptionDate, memberId) {
  if (!Array.isArray(parsedDrugs) || parsedDrugs.length === 0) {
    return { allDuplicate: false, totalDrugs: 0, duplicateCount: 0, matches: [] };
  }

  const rxDate = (prescriptionDate || '').trim();
  if (!rxDate) {
    // Without a date we can't be confident — don't block upload
    return { allDuplicate: false, totalDrugs: parsedDrugs.length, duplicateCount: 0, matches: [] };
  }

  const existing = await getPrescriptions(memberId);
  const matches  = [];

  for (const d of parsedDrugs) {
    const newName = (d.drug_name || d.drug || d.name || '').trim().toLowerCase();
    if (!newName) continue;

    const matched = existing.find(r =>
      (r.drug || '').trim().toLowerCase() === newName &&
      (r.prescriptionDate || r.rxDate || '').trim() === rxDate
    );

    if (matched) {
      matches.push({
        drugName:           d.drug_name || d.drug || d.name,
        existingRxId:       matched.id,
        existingDrugName:   matched.drug,
      });
    }
  }

  const totalDrugs     = parsedDrugs.length;
  const duplicateCount = matches.length;
  const allDuplicate   = duplicateCount === totalDrugs && totalDrugs > 0;

  return { allDuplicate, totalDrugs, duplicateCount, matches };
}

// AI Lab Report Save
export async function saveLabReportFromAI(parsed, memberId, overrides = {}) {
  if (!parsed || !Array.isArray(parsed.panels)) {
    return { reportsSaved: 0, valuesAdded: 0, newlyTrackedMetrics: [] };
  }

  const labName    = (overrides.labName || parsed.lab_name || 'Unknown Lab').trim();
  const reportDate = overrides.reportDate
                   || parsed.report_date
                   || new Date().toISOString().slice(0, 10);

  let reportsSaved = 0;
  let valuesAdded  = 0;

  for (const panel of parsed.panels) {
    if (!panel || !Array.isArray(panel.tests)) continue;

    const abnormalCount = panel.tests.filter(t =>
      t && ['low', 'high', 'critical_low', 'critical_high', 'abnormal'].includes(t.flag)
    ).length;

    const report = {
      id:          `${Date.now()}_${reportsSaved}_${Math.random().toString(36).slice(2, 7)}`,
      name:        panel.panel_name || 'Lab Report',
      lab:         labName,
      category:    panel.category || 'Blood',
      date:        reportDate,
      uploadedAt:  new Date().toISOString(),
      patientName: parsed.patient_name || null,
      tests:       panel.tests,
      status:      abnormalCount > 0 ? 'abnormal' : 'normal',
      abnormalCount,
      testCount:   panel.tests.length,
    };

    await addReport(report, memberId);
    reportsSaved += 1;

    for (const t of panel.tests) {
      if (!t || typeof t.value !== 'number') continue;
      const metricId = canonicalToMetricId(t.name);
      if (!metricId) continue;
      await addTimelineEntry(metricId, t.value, reportDate, memberId);
      valuesAdded += 1;
    }
  }

  const newlyTrackedMetrics = [];
  if (Array.isArray(parsed.abnormal_findings) && parsed.abnormal_findings.length > 0) {
    const tracked = await getTrackedMetrics(memberId);
    const trackedSet = new Set(tracked);

    for (const finding of parsed.abnormal_findings) {
      const metricId = canonicalToMetricId(finding.name);
      if (!metricId) continue;
      if (trackedSet.has(metricId)) continue;
      await addTrackedMetric(metricId, memberId);
      trackedSet.add(metricId);
      newlyTrackedMetrics.push({
        metricId,
        label: METRIC_LABELS[metricId] || finding.name,
        flag:  finding.flag,
      });
    }
  }

  return { reportsSaved, valuesAdded, newlyTrackedMetrics };
}

export async function getTieredTrackedMetrics(memberId) {
  const tracked = await getTrackedMetrics(memberId);
  const defaults = new Set(DEFAULT_TRACKED_METRICS);
  const tier1 = [];
  const autoPromoted = [];
  for (const m of tracked) {
    if (defaults.has(m)) tier1.push(m);
    else                 autoPromoted.push(m);
  }
  return { tier1, autoPromoted };
}
