import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Keys ────────────────────────────────────────────────────────────
const key = (type, memberId) => `${type}_${memberId || 'default'}`;

// ─── Default Tier 1 metrics (12) ─────────────────────────────────────
// Always shown in Trends by default. New metrics auto-promote on first
// abnormal reading; users can also pin extras manually.
export const DEFAULT_TRACKED_METRICS = [
  'hba1c', 'glucose', 'hb', 'tsh', 'cholesterol',
  'ldl', 'hdl', 'triglycerides', 'creatinine',
  'urea', 'platelet', 'wbc',
];

// ─── Reports ─────────────────────────────────────────────────────────
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

// ─── Prescriptions ───────────────────────────────────────────────────
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

// ─── Timeline values ─────────────────────────────────────────────────
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
  // Avoid duplicate dates
  const filtered = existing[metricId].filter(e => e.date !== date);
  existing[metricId] = [...filtered, { date, value }]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  await saveTimelineValues(existing, memberId);
  return existing;
}

// ─── Legacy regex OCR parser (kept for fallback) ─────────────────────
export async function parseAndSaveLabValues(rawText, date, memberId) {
  const metrics = [
    { id: 'hba1c',         patterns: ['hba1c', 'hb a1c', 'glycated', 'glycosylated'],          unit: '%',         multiplier: 1 },
    { id: 'glucose',       patterns: ['fasting glucose', 'fasting blood glucose', 'fbg', 'fbs'], unit: 'mg/dL',  multiplier: 1 },
    { id: 'hb',            patterns: ['haemoglobin', 'hemoglobin', 'hb ', 'hgb'],              unit: 'g/dL',      multiplier: 1 },
    { id: 'tsh',           patterns: ['tsh', 'thyroid stimulating'],                            unit: 'mIU/L',     multiplier: 1 },
    { id: 'cholesterol',   patterns: ['total cholesterol', 'cholesterol total', 'chol'],        unit: 'mg/dL',     multiplier: 1 },
    { id: 'ldl',           patterns: ['ldl', 'low density', 'ldl cholesterol'],                 unit: 'mg/dL',     multiplier: 1 },
    { id: 'hdl',           patterns: ['hdl', 'high density', 'hdl cholesterol'],                unit: 'mg/dL',     multiplier: 1 },
    { id: 'triglycerides', patterns: ['triglycerides', 'triglyceride', 'tgl', 'trig'],          unit: 'mg/dL',     multiplier: 1 },
    { id: 'creatinine',    patterns: ['creatinine', 'serum creatinine', 'creat'],               unit: 'mg/dL',     multiplier: 1 },
    { id: 'urea',          patterns: ['blood urea', 'urea', 'bun'],                             unit: 'mg/dL',     multiplier: 1 },
    { id: 'platelet',      patterns: ['platelet', 'plt', 'thrombocyte'],                        unit: 'lakh/μL',   multiplier: 1 },
    { id: 'wbc',           patterns: ['wbc', 'white blood', 'leucocyte', 'leukocyte'],          unit: 'cells/μL',  multiplier: 1 },
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
//  NEW IN v1.6 — TIER 1/2 TRACKED METRICS + AI LAB SAVE
// ====================================================================

// ─── Test name → metricId mapping ────────────────────────────────────
// Backend sends canonical names like "HbA1c", "Hemoglobin", "Vitamin D".
// We map them to short metricIds the timeline + UI use.
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

// Display labels for metricIds (used in Trends)
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

// Convert Claude's canonical name → our metricId. Falls back to lowercased/snake-cased name.
function canonicalToMetricId(canonicalName) {
  if (!canonicalName) return null;
  const key = canonicalName.trim().toLowerCase();
  if (NAME_TO_METRIC_ID[key]) return NAME_TO_METRIC_ID[key];
  // Fallback: snake_case the name so unknown metrics still get an ID
  return key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Tracked metrics (per member, with auto-promotion) ────────────────
export async function getTrackedMetrics(memberId) {
  try {
    const data = await AsyncStorage.getItem(key('tracked_metrics', memberId));
    if (data) return JSON.parse(data);
  } catch { /* fall through */ }
  // First time for this member — seed with defaults
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

// Returns metrics that have data in timeline but are NOT yet tracked.
// Used by the metric picker sheet.
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
  // Sort by reading count descending (most data first)
  available.sort((a, b) => b.readingCount - a.readingCount);
  return available;
}

// ─── AI Lab Report Save (new structured pipeline) ────────────────────
// Takes the parsed result from /ocr/report and:
//   1. Saves a report card per panel detected
//   2. Pushes every numeric test value into the timeline using the
//      report_date (NOT today's date) — so historical reports land
//      in the right spot on Trend charts
//   3. Auto-promotes any abnormal metric not already tracked
//
// Returns { reportsSaved, valuesAdded, newlyTrackedMetrics }
//
// Expected `parsed` shape from backend v1.6.0:
//   {
//     lab_name, report_date, patient_name,
//     panels: [{ panel_name, category, tests: [{ name, value, unit, normal_range, flag, is_standard_metric }] }],
//     abnormal_findings: [{ name, value, unit, flag, panel, category }]
//   }
//
// Optional `overrides` lets the user edit lab_name and report_date on the
// review screen before save: { labName, reportDate }
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

  // 1. Save one report card per panel
  for (const panel of parsed.panels) {
    if (!panel || !Array.isArray(panel.tests)) continue;

    const abnormalCount = panel.tests.filter(t =>
      t && ['low', 'high', 'critical_low', 'critical_high', 'abnormal'].includes(t.flag)
    ).length;

    const report = {
      id:        `${Date.now()}_${reportsSaved}_${Math.random().toString(36).slice(2, 7)}`,
      name:      panel.panel_name || 'Lab Report',
      lab:       labName,
      category:  panel.category || 'Blood',
      date:      reportDate,                         // <-- test date, not upload date
      uploadedAt: new Date().toISOString(),          // kept internally only
      patientName: parsed.patient_name || null,
      tests:     panel.tests,
      status:    abnormalCount > 0 ? 'abnormal' : 'normal',
      abnormalCount,
      testCount: panel.tests.length,
    };

    await addReport(report, memberId);
    reportsSaved += 1;

    // 2. Push every numeric test value into the timeline using report_date
    for (const t of panel.tests) {
      if (!t || typeof t.value !== 'number') continue;   // skip qualitative values
      const metricId = canonicalToMetricId(t.name);
      if (!metricId) continue;
      await addTimelineEntry(metricId, t.value, reportDate, memberId);
      valuesAdded += 1;
    }
  }

  // 3. Auto-promote any abnormal metric not already tracked
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

// ─── Helper used by Trends to split tracked metrics into tiers ───────
// Returns { tier1, autoPromoted } where:
//   tier1        = the original 12 defaults (always shown first)
//   autoPromoted = any tracked metric not in DEFAULT_TRACKED_METRICS
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