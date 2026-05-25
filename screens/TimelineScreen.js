import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
 TouchableOpacity, Dimensions, Modal, TextInput, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getTimelineValues, getTrackedMetrics, addTrackedMetric,
  removeTrackedMetric, getAvailableMetrics, getTieredTrackedMetrics,
  DEFAULT_TRACKED_METRICS, METRIC_LABELS,
} from '../storage';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 80;

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const RED     = '#EF4444';
const PURPLE  = '#7C3AED';
const PURPLE_LT = '#EEEDFE';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

// ── Metric definitions ───────────────────────────────────────────────
// Each entry has display info + normal range. We show charts for any metric
// in this list — for unknown auto-promoted metrics, we render a generic card.
const METRIC_DEFS = {
  // Tier 1 defaults (12)
  hba1c:         { id: 'hba1c',         name: 'HbA1c',             unit: '%',     emoji: '🩸', normal: { min: 4.0,  max: 5.6  }, warningMax: 6.4   },
  glucose:       { id: 'glucose',       name: 'Fasting Glucose',   unit: 'mg/dL', emoji: '🍬', normal: { min: 70,   max: 100  }, warningMax: 125   },
  hb:            { id: 'hb',            name: 'Haemoglobin',       unit: 'g/dL',  emoji: '💉', normal: { min: 12.0, max: 16.0 }, warningMax: 16.0  },
  tsh:           { id: 'tsh',           name: 'TSH',               unit: 'mIU/L', emoji: '🦋', normal: { min: 0.4,  max: 4.0  }, warningMax: 4.0   },
  cholesterol:   { id: 'cholesterol',   name: 'Total Cholesterol', unit: 'mg/dL', emoji: '🫀', normal: { min: 0,    max: 200  }, warningMax: 239   },
  ldl:           { id: 'ldl',           name: 'LDL Cholesterol',   unit: 'mg/dL', emoji: '🔴', normal: { min: 0,    max: 100  }, warningMax: 159   },
  hdl:           { id: 'hdl',           name: 'HDL Cholesterol',   unit: 'mg/dL', emoji: '🟢', normal: { min: 40,   max: 60   }, warningMax: 60    },
  triglycerides: { id: 'triglycerides', name: 'Triglycerides',     unit: 'mg/dL', emoji: '🫁', normal: { min: 0,    max: 150  }, warningMax: 199   },
  creatinine:    { id: 'creatinine',    name: 'Creatinine',        unit: 'mg/dL', emoji: '🫘', normal: { min: 0.6,  max: 1.2  }, warningMax: 2.0   },
  urea:          { id: 'urea',          name: 'Urea',              unit: 'mg/dL', emoji: '💧', normal: { min: 7,    max: 20   }, warningMax: 40    },
  platelet:      { id: 'platelet',      name: 'Platelets',         unit: 'lakh',  emoji: '🟣', normal: { min: 1.5,  max: 4.5  }, warningMax: 4.5   },
  wbc:           { id: 'wbc',           name: 'WBC',               unit: '/cumm', emoji: '⚪', normal: { min: 4000, max: 11000}, warningMax: 13000 },

  // Common auto-promoted metrics — supports charts when AI extracts them
  uric_acid:     { id: 'uric_acid',     name: 'Uric Acid',         unit: 'mg/dL', emoji: '🟠', normal: { min: 3.5,  max: 7.2  }, warningMax: 9.0   },
  vitamin_d:     { id: 'vitamin_d',     name: 'Vitamin D',         unit: 'ng/mL', emoji: '☀️', normal: { min: 30,   max: 100  }, warningMax: 100   },
  vitamin_b12:   { id: 'vitamin_b12',   name: 'Vitamin B12',       unit: 'pg/mL', emoji: '🟡', normal: { min: 200,  max: 900  }, warningMax: 900   },
  esr:           { id: 'esr',           name: 'ESR',               unit: 'mm/hr', emoji: '🩹', normal: { min: 0,    max: 20   }, warningMax: 40    },
  crp:           { id: 'crp',           name: 'CRP',               unit: 'mg/L',  emoji: '🔥', normal: { min: 0,    max: 5    }, warningMax: 10    },
  sgot:          { id: 'sgot',          name: 'SGOT (AST)',        unit: 'IU/L',  emoji: '🟤', normal: { min: 0,    max: 40   }, warningMax: 80    },
  sgpt:          { id: 'sgpt',          name: 'SGPT (ALT)',        unit: 'IU/L',  emoji: '🟤', normal: { min: 0,    max: 56   }, warningMax: 100   },
  bilirubin:     { id: 'bilirubin',     name: 'Bilirubin Total',   unit: 'mg/dL', emoji: '🟨', normal: { min: 0.1,  max: 1.2  }, warningMax: 2.0   },
  bun:           { id: 'bun',           name: 'BUN',               unit: 'mg/dL', emoji: '💧', normal: { min: 7,    max: 20   }, warningMax: 40    },
  rbc:           { id: 'rbc',           name: 'RBC',               unit: 'mil/cumm',emoji:'🔴', normal: { min: 4.5,  max: 5.9  }, warningMax: 6.5   },
  sodium:        { id: 'sodium',        name: 'Sodium',            unit: 'mEq/L', emoji: '🧂', normal: { min: 135,  max: 145  }, warningMax: 150   },
  potassium:     { id: 'potassium',     name: 'Potassium',         unit: 'mEq/L', emoji: '🍌', normal: { min: 3.5,  max: 5.0  }, warningMax: 6.0   },
  t3:            { id: 't3',            name: 'T3',                unit: 'ng/dL', emoji: '🦋', normal: { min: 80,   max: 200  }, warningMax: 250   },
  t4:            { id: 't4',            name: 'T4',                unit: 'µg/dL', emoji: '🦋', normal: { min: 5,    max: 12   }, warningMax: 15    },
  free_t3:       { id: 'free_t3',       name: 'Free T3',           unit: 'pg/mL', emoji: '🦋', normal: { min: 2.0,  max: 4.4  }, warningMax: 5.0   },
  free_t4:       { id: 'free_t4',       name: 'Free T4',           unit: 'ng/dL', emoji: '🦋', normal: { min: 0.8,  max: 1.8  }, warningMax: 2.5   },
};

// Build a definition for a metric we don't have explicit info on (auto-promoted unknowns).
function genericDef(metricId) {
  const label = METRIC_LABELS[metricId] || metricId;
  return {
    id:        metricId,
    name:      label,
    unit:      '',
    emoji:     '📊',
    normal:    { min: 0, max: 0 },     // disable range checks for unknowns
    warningMax: 0,
    unknownRange: true,
  };
}

// Sample data for the first-run experience — only the original 9 metrics
const SAMPLE_DATA = {
  hba1c:        [{ date: 'Oct 25', value: 7.2 }, { date: 'Jan 26', value: 6.8 }],
  glucose:      [{ date: 'Oct 25', value: 138 }, { date: 'Jan 26', value: 122 }],
  hb:           [{ date: 'Oct 25', value: 10.2 }],
  tsh:          [{ date: 'Jan 26', value: 3.2 }],
  cholesterol:  [{ date: 'Oct 25', value: 224 }],
};

// ── Date helper ─────────────────────────────────────────────────────
function formatPointDate(any) {
  if (!any) return '';
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(String(any))) {
    try {
      const d = new Date(any);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      }
    } catch {}
  }
  return String(any);
}

// ── Status helpers ───────────────────────────────────────────────────
function getStatus(value, metric) {
  if (metric.unknownRange) return 'normal';
  if (value >= metric.normal.min && value <= metric.normal.max) return 'normal';
  if (value <= metric.warningMax) return 'warning';
  return 'high';
}

function statusColor(status) {
  if (status === 'normal')  return GREEN;
  if (status === 'warning') return ORANGE;
  return RED;
}

function statusBg(status) {
  if (status === 'normal')  return '#F0FDF4';
  if (status === 'warning') return '#FFFBEB';
  return '#FEF2F2';
}

function statusLabel(status) {
  if (status === 'normal')  return '✓ Normal';
  if (status === 'warning') return '⚠ Borderline';
  return '✕ High';
}

// ── Trend Chart (same custom impl as before, just slightly more defensive) ──
function TrendChart({ metric }) {
  const CHART_H = 120;
  const plotW   = CHART_WIDTH - 48;
  const values  = metric.data.map(d => d.value);
  const maxVal  = Math.max(...values, metric.normal.max || values[0] || 0) * 1.15 || 1;
  const minVal  = Math.min(...values, metric.normal.min || values[0] || 0) * 0.85 || 0;
  const range   = (maxVal - minVal) || 1;
  const n       = metric.data.length;
  const latestStatus = getStatus(values[values.length - 1], metric);

  function toY(val) { return CHART_H - ((val - minVal) / range) * CHART_H; }
  function toX(i)   { return n === 1 ? plotW / 2 : (i / (n - 1)) * plotW; }

  const lineColor   = statusColor(latestStatus);
  const normalMaxY  = toY(Math.min(metric.normal.max || maxVal, maxVal));
  const normalMinY  = toY(Math.max(metric.normal.min || minVal, minVal));

  return (
    <View style={tc.wrap}>
      <View style={tc.yAxis}>
        <Text style={tc.yLabel}>{maxVal.toFixed(1)}</Text>
        <Text style={tc.yLabel}>{((maxVal + minVal) / 2).toFixed(1)}</Text>
        <Text style={tc.yLabel}>{minVal.toFixed(1)}</Text>
      </View>

      <View style={[tc.chartArea, { width: plotW, height: CHART_H }]}>
        {!metric.unknownRange && (
          <View style={[tc.normalBand, {
            top:    Math.min(normalMaxY, normalMinY),
            height: Math.max(Math.abs(normalMinY - normalMaxY), 4),
          }]} />
        )}

        {metric.data.map((point, i) => {
          if (i === 0) return null;
          const x1 = toX(i - 1), y1 = toY(metric.data[i - 1].value);
          const x2 = toX(i),     y2 = toY(point.value);
          const dx = x2 - x1, dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={i} style={[tc.line, {
              width:           length,
              left:            x1,
              top:             y1,
              transform:       [{ rotate: `${angle}deg` }],
              backgroundColor: lineColor,
            }]} />
          );
        })}

        {metric.data.map((point, i) => {
          const status = getStatus(point.value, metric);
          const x = toX(i), y = toY(point.value);
          const isLast = i === metric.data.length - 1;
          return (
            <View key={i}>
              <View style={[tc.dot, {
                left:            x - (isLast ? 7 : 5),
                top:             y - (isLast ? 7 : 5),
                width:           isLast ? 14 : 10,
                height:          isLast ? 14 : 10,
                borderRadius:    isLast ? 7 : 5,
                backgroundColor: statusColor(status),
                borderWidth:     isLast ? 2 : 0,
                borderColor:     '#FFF',
              }]} />
              <View style={[tc.valueLabel, { left: x - 20, top: y - 28 }]}>
                <Text style={[tc.valueLabelText, { color: statusColor(status) }]}>
                  {point.value}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[tc.xAxis, { width: plotW, marginLeft: 32 }]}>
        {metric.data.map((point, i) => (
          <Text key={i} style={[tc.xLabel, {
            left:       toX(i) - 20,
            fontWeight: i === n - 1 ? '700' : '400',
            color:      i === n - 1 ? DARK : GRAY,
          }]}>
            {formatPointDate(point.date)}
          </Text>
        ))}
      </View>

      {!metric.unknownRange && (
        <View style={tc.legend}>
          <View style={tc.legendDot} />
          <Text style={tc.legendText}>Normal: {metric.normal.min}–{metric.normal.max} {metric.unit}</Text>
        </View>
      )}
    </View>
  );
}

// ── Metric Card ──────────────────────────────────────────────────────
function MetricCard({ metric, expanded, onPress, onRemove, isAutoPromoted }) {
  const latest    = metric.data[metric.data.length - 1];
  const previous  = metric.data[metric.data.length - 2];
  const status    = getStatus(latest.value, metric);
  const diff      = previous ? (latest.value - previous.value).toFixed(1) : null;
  const lowerIsBetter = ['hba1c', 'glucose', 'cholesterol', 'ldl', 'triglycerides', 'creatinine', 'uric_acid', 'esr', 'crp', 'sgot', 'sgpt', 'bilirubin'].includes(metric.id);
  const improved  = diff !== null && (
    lowerIsBetter ? parseFloat(diff) < 0 : parseFloat(diff) > 0
  );
  const trendIcon = diff === null ? null
    : parseFloat(diff) < 0 ? '↓'
    : parseFloat(diff) > 0 ? '↑'
    : '→';

  return (
    <TouchableOpacity
      style={[s.metricCard, expanded && s.metricCardExpanded]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={s.metricTop}>
        <View style={[s.metricIconBox, { backgroundColor: statusBg(status) }]}>
          <Text style={{ fontSize: 22 }}>{metric.emoji}</Text>
        </View>
        <View style={s.metricLeft}>
          <View style={s.metricNameRow}>
            <Text style={s.metricName}>{metric.name}</Text>
            {isAutoPromoted && (
              <View style={s.newBadge}>
                <Text style={s.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          <View style={s.metricValueRow}>
            <Text style={[s.metricValue, { color: statusColor(status) }]}>{latest.value}</Text>
            {metric.unit && <Text style={s.metricUnit}> {metric.unit}</Text>}
            {trendIcon && (
              <View style={[s.trendBadge, { backgroundColor: improved ? '#F0FDF4' : '#FEF2F2' }]}>
                <Text style={[s.trendText, { color: improved ? GREEN : RED }]}>
                  {trendIcon} {Math.abs(parseFloat(diff))}
                </Text>
              </View>
            )}
          </View>
          <Text style={s.metricDate}>Last tested: {formatPointDate(latest.date)}</Text>
        </View>
        <View style={s.metricRightCol}>
          <View style={[s.statusPill, { backgroundColor: statusBg(status) }]}>
            <Text style={[s.statusPillText, { color: statusColor(status) }]}>
              {statusLabel(status)}
            </Text>
          </View>
          <TouchableOpacity style={s.menuBtn} onPress={(e) => {
            e.stopPropagation?.();
            Alert.alert(
              metric.name,
              null,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove from Trends', style: 'destructive', onPress: () => onRemove(metric.id, metric.name) },
              ]
            );
          }}>
            <Text style={s.menuBtnText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!metric.unknownRange && (
        <View style={s.rangeRow}>
          <Text style={s.rangeLabel}>Normal: {metric.normal.min}–{metric.normal.max} {metric.unit}</Text>
        </View>
      )}

      {expanded && (
        <View style={s.chartSection}>
          <Text style={s.chartTitle}>Trend over time</Text>
          <TrendChart metric={metric} />
          {status !== 'normal' && (
            <View style={s.tipBox}>
              <Text style={s.tipIcon}>💡</Text>
              <Text style={s.tipText}>
                This value is outside the normal range. Discuss with your doctor at your next visit.
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={s.expandHint}>{expanded ? '▲ Collapse' : '▼ See trend chart'}</Text>
    </TouchableOpacity>
  );
}

// ── Metric Picker Sheet ──────────────────────────────────────────────
function MetricPickerSheet({ visible, available, onClose, onAdd }) {
  const [search, setSearch] = useState('');
  const filtered = available.filter(m =>
    m.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  function close() { setSearch(''); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mp.overlay}>
        <View style={mp.sheet}>
          <View style={mp.handle} />
          <View style={mp.header}>
            <View style={{ flex: 1 }}>
              <Text style={mp.title}>Track another metric</Text>
              <Text style={mp.sub}>
                {available.length === 0
                  ? 'Upload a lab report first — we\'ll show metrics here once we have data.'
                  : `${available.length} value${available.length !== 1 ? 's' : ''} from your reports, not yet tracked`}
              </Text>
            </View>
            <TouchableOpacity style={mp.closeBtn} onPress={close}>
              <Text style={mp.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {available.length > 0 && (
            <TextInput
              style={mp.search}
              placeholder="Search..."
              value={search}
              onChangeText={setSearch}
            />
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {filtered.length === 0 && available.length > 0 && (
              <Text style={mp.empty}>No matches for "{search}"</Text>
            )}
            {available.length === 0 && (
              <View style={mp.zeroState}>
                <Text style={mp.zeroEmoji}>📊</Text>
                <Text style={mp.zeroTitle}>Nothing to add yet</Text>
                <Text style={mp.zeroText}>
                  When you upload a lab report, any extra values not already in your trends
                  will show up here for you to start tracking.
                </Text>
              </View>
            )}
            {filtered.map(m => (
              <View key={m.metricId} style={mp.row}>
                <View style={{ flex: 1 }}>
                  <Text style={mp.rowName}>{m.label}</Text>
                  <Text style={mp.rowMeta}>
                    {m.readingCount} reading{m.readingCount !== 1 ? 's' : ''} · last: {m.latestValue}
                  </Text>
                </View>
                <TouchableOpacity
                  style={mp.trackBtn}
                  onPress={() => { onAdd(m.metricId, m.label); close(); }}
                >
                  <Text style={mp.trackBtnText}>Track</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────
export default function TimelineScreen({ activeMember }) {
  const [expanded,        setExpanded]        = useState(null);
  const [filter,          setFilter]          = useState('all');
  const [tier1Metrics,    setTier1Metrics]    = useState([]);
  const [autoPromoted,    setAutoPromoted]    = useState([]);
  const [pickerVisible,   setPickerVisible]   = useState(false);
  const [available,       setAvailable]       = useState([]);
  const [showSampleData,  setShowSampleData]  = useState(false);
  const memberId = activeMember?.id || 'default';

  useEffect(() => { loadTimelineData(); }, [activeMember]);

 async function loadTimelineData() {
    try {
      const stored = await getTimelineValues(memberId);
      const storedKeys = Object.keys(stored);

   

      const tieredResult = await getTieredTrackedMetrics(memberId);
      const tier1 = tieredResult.tier1 || [];
      const promotedIds = tieredResult.autoPromoted || [];

    

      const hasAnyRealData = storedKeys.length > 0;
      setShowSampleData(!hasAnyRealData);

      const tier1Built = tier1.map(metricId => {
        const def = METRIC_DEFS[metricId] || genericDef(metricId);
        const realData = stored[metricId] || [];
        let data = realData;
        if (data.length === 0 && !hasAnyRealData) {
          data = SAMPLE_DATA[metricId] || [];
        }
        return { ...def, data };
      }).filter(m => m.data.length > 0);

      const autoBuilt = promotedIds.map(metricId => {
        const def = METRIC_DEFS[metricId] || genericDef(metricId);
        const realData = stored[metricId] || [];
        return { ...def, data: realData };
      }).filter(m => m.data.length > 0);

   

      setTier1Metrics(tier1Built);
      setAutoPromoted(autoBuilt);

      try {
        const avail = await getAvailableMetrics(memberId);
        setAvailable(avail);
      } catch (availErr) {
        console.log('getAvailableMetrics error:', availErr);
        setAvailable([]);
      }
    } catch(e) {
      console.log('loadTimelineData error:', e);
      
      setTier1Metrics([]);
      setAutoPromoted([]);
      setAvailable([]);
      setShowSampleData(false);
    }
  }

  async function handleAddMetric(metricId, metricLabel) {
    await addTrackedMetric(metricId, memberId);
    await loadTimelineData();
    Alert.alert('✅ Tracking', `${metricLabel} added to your Trends.`);
  }

  async function handleRemoveMetric(metricId, metricName) {
    await removeTrackedMetric(metricId, memberId);
    await loadTimelineData();
    Alert.alert('Removed', `${metricName} removed from your Trends. Your readings are still saved.`);
  }

  // Filtering: combine both tiers for "needs review" count
  const allMetrics = [...tier1Metrics, ...autoPromoted];
  const abnormalMetrics = allMetrics.filter(m => {
    const latest = m.data[m.data.length - 1];
    return getStatus(latest.value, m) !== 'normal';
  });
  const abnormalIds = new Set(abnormalMetrics.map(m => m.id));

  // What to display based on the active filter
  const showTier1 = filter === 'all'
    ? tier1Metrics
    : tier1Metrics.filter(m => abnormalIds.has(m.id));
  const showAuto  = filter === 'all'
    ? autoPromoted
    : autoPromoted.filter(m => abnormalIds.has(m.id));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Trends</Text>
            <Text style={s.subtitle}>
              {allMetrics.length > 0
                ? `Tracking ${allMetrics.length} metric${allMetrics.length !== 1 ? 's' : ''}`
                : 'Upload reports to see your trends'}
              {showSampleData && allMetrics.length > 0 ? ' · Sample data' : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.addMetricBtn} onPress={() => setPickerVisible(true)}>
            <Text style={s.addMetricBtnText}>+ Track</Text>
          </TouchableOpacity>
        </View>

        {showSampleData && allMetrics.length > 0 && (
          <View style={s.sampleBanner}>
            <Text style={s.sampleBannerText}>
              📊 Showing sample data. Upload a lab report to see your real trends.
            </Text>
          </View>
        )}

        <View style={s.summaryCard}>
          {[
            { label: 'Metrics',      value: allMetrics.length,                          color: TEAL  },
            { label: 'Normal',       value: allMetrics.length - abnormalMetrics.length, color: GREEN },
            { label: 'Needs review', value: abnormalMetrics.length,                     color: abnormalMetrics.length > 0 ? RED : GREEN },
          ].map((item, i) => (
            <View key={i} style={[s.summaryItem, i < 2 && s.summaryBorder]}>
              <Text style={[s.summaryValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {allMetrics.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📈</Text>
            <Text style={s.emptyTitle}>No data yet</Text>
            <Text style={s.emptyText}>Upload lab reports and values will automatically appear here</Text>
          </View>
        )}

        {allMetrics.length > 0 && (
          <View style={s.tabRow}>
            <TouchableOpacity style={[s.tabBtn, filter === 'all' && s.tabBtnActive]} onPress={() => setFilter('all')}>
              <Text style={[s.tabText, filter === 'all' && s.tabTextActive]}>All Metrics</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, filter === 'abnormal' && s.tabBtnActive]} onPress={() => setFilter('abnormal')}>
              <Text style={[s.tabText, filter === 'abnormal' && s.tabTextActive]}>
                Needs Review {abnormalMetrics.length > 0 ? `(${abnormalMetrics.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tier 1: default 12 ── */}
        {showTier1.length > 0 && (
          <>
            <Text style={s.tierLabel}>Main metrics</Text>
            {showTier1.map(m => (
              <MetricCard
                key={m.id}
                metric={m}
                expanded={expanded === m.id}
                onPress={() => setExpanded(expanded === m.id ? null : m.id)}
                onRemove={handleRemoveMetric}
                isAutoPromoted={false}
              />
            ))}
          </>
        )}

        {/* ── Auto-Promoted "Now Tracking" ── */}
        {showAuto.length > 0 && (
          <>
            <View style={s.tierHeaderRow}>
              <Text style={s.tierLabel}>Now tracking</Text>
              <View style={s.newPill}>
                <Text style={s.newPillText}>auto-added</Text>
              </View>
            </View>
            {showAuto.map(m => (
              <MetricCard
                key={m.id}
                metric={m}
                expanded={expanded === m.id}
                onPress={() => setExpanded(expanded === m.id ? null : m.id)}
                onRemove={handleRemoveMetric}
                isAutoPromoted={true}
              />
            ))}
          </>
        )}

        {filter === 'abnormal' && abnormalMetrics.length === 0 && allMetrics.length > 0 && (
          <View style={s.allClear}>
            <Text style={s.allClearEmoji}>✅</Text>
            <Text style={s.allClearTitle}>All clear!</Text>
            <Text style={s.allClearText}>None of your tracked metrics need review right now.</Text>
          </View>
        )}

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            ℹ️ Values shown from your uploaded reports. Reference ranges based on ICMR / WHO India guidelines.
          </Text>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      <MetricPickerSheet
        visible={pickerVisible}
        available={available}
        onClose={() => setPickerVisible(false)}
        onAdd={handleAddMetric}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: BG },
  scroll:            { paddingHorizontal: 20 },
  header:            { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 16 },
  title:             { fontSize: 22, fontWeight: '800', color: DARK },
  subtitle:          { fontSize: 13, color: GRAY, marginTop: 2 },
  addMetricBtn:      { backgroundColor: TEAL, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, elevation: 3, shadowColor: TEAL, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  addMetricBtnText:  { color: '#FFF', fontWeight: '700', fontSize: 13 },

  sampleBanner:      { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#3B82F6' },
  sampleBannerText:  { fontSize: 12, color: '#1E40AF', lineHeight: 17 },

  summaryCard:       { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  summaryItem:       { flex: 1, alignItems: 'center' },
  summaryBorder:     { borderRightWidth: 1, borderRightColor: '#F3F4F6' },
  summaryValue:      { fontSize: 26, fontWeight: '800' },
  summaryLabel:      { fontSize: 11, color: GRAY, marginTop: 4, fontWeight: '500' },

  tabRow:            { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4, marginBottom: 16 },
  tabBtn:            { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive:      { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  tabText:           { fontSize: 13, color: GRAY, fontWeight: '500' },
  tabTextActive:     { color: DARK, fontWeight: '700' },

  // Tier headers
  tierLabel:         { fontSize: 11, color: GRAY, marginTop: 6, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' },
  tierHeaderRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10 },
  newPill:           { backgroundColor: PURPLE_LT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  newPillText:       { fontSize: 9, color: '#3C3489', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  // Metric card
  metricCard:        { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  metricCardExpanded:{ borderWidth: 1.5, borderColor: TEAL_LT },
  metricTop:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  metricIconBox:     { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metricLeft:        { flex: 1 },
  metricNameRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metricName:        { fontSize: 13, color: GRAY, fontWeight: '600' },
  newBadge:          { backgroundColor: PURPLE_LT, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  newBadgeText:      { fontSize: 9, color: '#3C3489', fontWeight: '700', letterSpacing: 0.4 },
  metricValueRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metricValue:       { fontSize: 26, fontWeight: '800' },
  metricUnit:        { fontSize: 13, color: GRAY, marginTop: 6 },
  trendBadge:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  trendText:         { fontSize: 12, fontWeight: '700' },
  metricDate:        { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  metricRightCol:    { alignItems: 'flex-end', gap: 6 },
  statusPill:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText:    { fontSize: 12, fontWeight: '700' },
  menuBtn:           { paddingHorizontal: 6, paddingVertical: 2 },
  menuBtnText:       { fontSize: 16, color: GRAY, fontWeight: '700' },

  rangeRow:          { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F9FAFB' },
  rangeLabel:        { fontSize: 12, color: '#9CA3AF' },
  chartSection:      { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  chartTitle:        { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 14 },
  tipBox:            { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginTop: 12, gap: 8 },
  tipIcon:           { fontSize: 16, marginTop: 1 },
  tipText:           { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  expandHint:        { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 10 },

  // Disclaimer
  disclaimer:        { backgroundColor: TEAL_LT, borderRadius: 14, padding: 14, marginTop: 4 },
  disclaimerText:    { fontSize: 12, color: TEAL, lineHeight: 18, textAlign: 'center' },

  // Empty + all clear
  empty:             { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyEmoji:        { fontSize: 48, marginBottom: 12 },
  emptyTitle:        { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 6 },
  emptyText:         { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },
  allClear:          { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  allClearEmoji:     { fontSize: 38, marginBottom: 10 },
  allClearTitle:     { fontSize: 15, fontWeight: '700', color: DARK, marginBottom: 4 },
  allClearText:      { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 18 },
});

const tc = StyleSheet.create({
  wrap:           { paddingVertical: 8 },
  yAxis:          { position: 'absolute', left: 0, top: 0, height: 120, justifyContent: 'space-between', width: 28 },
  yLabel:         { fontSize: 9, color: GRAY, textAlign: 'right' },
  chartArea:      { marginLeft: 32, position: 'relative' },
  normalBand:     { position: 'absolute', left: 0, right: 0, backgroundColor: GREEN + '15', borderRadius: 4 },
  line:           { position: 'absolute', height: 2.5, transformOrigin: 'left center', borderRadius: 2 },
  dot:            { position: 'absolute', elevation: 2 },
  valueLabel:     { position: 'absolute', width: 40, alignItems: 'center' },
  valueLabelText: { fontSize: 10, fontWeight: '700' },
  xAxis:          { flexDirection: 'row', position: 'relative', height: 20, marginTop: 8 },
  xLabel:         { position: 'absolute', fontSize: 10, color: GRAY, width: 40, textAlign: 'center' },
  legend:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  legendDot:      { width: 12, height: 12, borderRadius: 3, backgroundColor: GREEN + '30', borderWidth: 1, borderColor: GREEN },
  legendText:     { fontSize: 11, color: GRAY },
});

const mp = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, maxHeight: '80%' },
  handle:       { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title:        { fontSize: 18, fontWeight: '700', color: DARK },
  sub:          { fontSize: 12, color: GRAY, marginTop: 4, lineHeight: 17 },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: GRAY, fontWeight: '700' },
  search:       { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 13, color: DARK, backgroundColor: '#FAFAFA', marginBottom: 12 },
  empty:        { textAlign: 'center', color: GRAY, fontSize: 13, paddingVertical: 24 },
  zeroState:    { alignItems: 'center', paddingVertical: 30 },
  zeroEmoji:    { fontSize: 38, marginBottom: 10 },
  zeroTitle:    { fontSize: 15, fontWeight: '700', color: DARK, marginBottom: 6 },
  zeroText:     { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  row:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },
  rowName:      { fontSize: 14, fontWeight: '600', color: DARK },
  rowMeta:      { fontSize: 11, color: GRAY, marginTop: 3 },
  trackBtn:     { backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  trackBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
});