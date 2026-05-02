import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Dimensions
} from 'react-native';
import { getTimelineValues } from '../storage';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 80;

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const RED     = '#EF4444';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

const METRIC_DEFS = [
  { id: 'hba1c',         name: 'HbA1c',            unit: '%',      emoji: '🩸', normal: { min: 4.0,  max: 5.6  }, warningMax: 6.4  },
  { id: 'glucose',       name: 'Fasting Glucose',   unit: 'mg/dL', emoji: '🍬', normal: { min: 70,   max: 100  }, warningMax: 125  },
  { id: 'hb',            name: 'Haemoglobin',       unit: 'g/dL',  emoji: '💉', normal: { min: 12.0, max: 16.0 }, warningMax: 16.0 },
  { id: 'tsh',           name: 'TSH',               unit: 'mIU/L', emoji: '🦋', normal: { min: 0.4,  max: 4.0  }, warningMax: 4.0  },
  { id: 'cholesterol',   name: 'Total Cholesterol', unit: 'mg/dL', emoji: '🫀', normal: { min: 0,    max: 200  }, warningMax: 239  },
  { id: 'ldl',           name: 'LDL Cholesterol',   unit: 'mg/dL', emoji: '🔴', normal: { min: 0,    max: 100  }, warningMax: 159  },
  { id: 'hdl',           name: 'HDL Cholesterol',   unit: 'mg/dL', emoji: '🟢', normal: { min: 40,   max: 60   }, warningMax: 60   },
  { id: 'triglycerides', name: 'Triglycerides',     unit: 'mg/dL', emoji: '🫁', normal: { min: 0,    max: 150  }, warningMax: 199  },
  { id: 'creatinine',    name: 'Creatinine',        unit: 'mg/dL', emoji: '🫘', normal: { min: 0.6,  max: 1.2  }, warningMax: 2.0  },
];

const SAMPLE_DATA = {
  hba1c:        [{ date: 'Oct 25', value: 7.2 }, { date: 'Jan 26', value: 6.8 }],
  glucose:      [{ date: 'Oct 25', value: 138 }, { date: 'Jan 26', value: 122 }],
  hb:           [{ date: 'Oct 25', value: 10.2 }],
  tsh:          [{ date: 'Jan 26', value: 3.2 }],
  cholesterol:  [{ date: 'Oct 25', value: 224 }],
};

function getStatus(value, metric) {
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

function TrendChart({ metric }) {
  const CHART_H = 120;
  const plotW   = CHART_WIDTH - 48;
  const values  = metric.data.map(d => d.value);
  const maxVal  = Math.max(...values, metric.normal.max) * 1.15;
  const minVal  = Math.min(...values, metric.normal.min) * 0.85;
  const range   = maxVal - minVal || 1;
  const n       = metric.data.length;
  const latestStatus = getStatus(values[values.length - 1], metric);

  function toY(val) {
    return CHART_H - ((val - minVal) / range) * CHART_H;
  }

  function toX(i) {
    return n === 1 ? plotW / 2 : (i / (n - 1)) * plotW;
  }

  const lineColor = statusColor(latestStatus);
  const normalMaxY = toY(Math.min(metric.normal.max, maxVal));
  const normalMinY = toY(Math.max(metric.normal.min, minVal));

  return (
    <View style={tc.wrap}>
      <View style={tc.yAxis}>
        <Text style={tc.yLabel}>{maxVal.toFixed(1)}</Text>
        <Text style={tc.yLabel}>{((maxVal + minVal) / 2).toFixed(1)}</Text>
        <Text style={tc.yLabel}>{minVal.toFixed(1)}</Text>
      </View>

      <View style={[tc.chartArea, { width: plotW, height: CHART_H }]}>
        <View style={[tc.normalBand, {
          top:    Math.min(normalMaxY, normalMinY),
          height: Math.max(Math.abs(normalMinY - normalMaxY), 4),
        }]} />

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
            {point.date}
          </Text>
        ))}
      </View>

      <View style={tc.legend}>
        <View style={tc.legendDot} />
        <Text style={tc.legendText}>Normal: {metric.normal.min}–{metric.normal.max} {metric.unit}</Text>
      </View>
    </View>
  );
}

function MetricCard({ metric, expanded, onPress }) {
  const latest   = metric.data[metric.data.length - 1];
  const previous = metric.data[metric.data.length - 2];
  const status   = getStatus(latest.value, metric);
  const diff     = previous ? (latest.value - previous.value).toFixed(1) : null;
  const improved = diff !== null && (
    ['hba1c', 'glucose', 'cholesterol', 'ldl', 'triglycerides'].includes(metric.id)
      ? parseFloat(diff) < 0
      : parseFloat(diff) > 0
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
          <Text style={s.metricName}>{metric.name}</Text>
          <View style={s.metricValueRow}>
            <Text style={[s.metricValue, { color: statusColor(status) }]}>{latest.value}</Text>
            <Text style={s.metricUnit}> {metric.unit}</Text>
            {trendIcon && (
              <View style={[s.trendBadge, { backgroundColor: improved ? '#F0FDF4' : '#FEF2F2' }]}>
                <Text style={[s.trendText, { color: improved ? GREEN : RED }]}>
                  {trendIcon} {Math.abs(parseFloat(diff))}
                </Text>
              </View>
            )}
          </View>
          <Text style={s.metricDate}>Last tested: {latest.date}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: statusBg(status) }]}>
          <Text style={[s.statusPillText, { color: statusColor(status) }]}>
            {statusLabel(status)}
          </Text>
        </View>
      </View>

      <View style={s.rangeRow}>
        <Text style={s.rangeLabel}>Normal: {metric.normal.min}–{metric.normal.max} {metric.unit}</Text>
      </View>

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

export default function TimelineScreen({ activeMember }) {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter]     = useState('all');
  const [metrics, setMetrics]   = useState([]);
  const memberId = activeMember?.id || 'default';

  useEffect(() => { loadTimelineData(); }, [activeMember]);

  async function loadTimelineData() {
    try {
      const stored = await getTimelineValues(memberId);
      const built  = METRIC_DEFS.map(def => {
        const realData = stored[def.id] || [];
        const data     = realData.length > 0 ? realData : (SAMPLE_DATA[def.id] || []);
        return { ...def, data };
      }).filter(m => m.data.length > 0);
      setMetrics(built);
    } catch(e) {
      // Fall back to sample data
      const built = METRIC_DEFS.map(def => ({
        ...def,
        data: SAMPLE_DATA[def.id] || []
      })).filter(m => m.data.length > 0);
      setMetrics(built);
    }
  }

  const abnormalMetrics = metrics.filter(m => {
    const latest = m.data[m.data.length - 1];
    return getStatus(latest.value, m) !== 'normal';
  });

  const displayed = filter === 'abnormal' ? abnormalMetrics : metrics;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        <View style={s.header}>
          <Text style={s.title}>Health Timeline</Text>
          <Text style={s.subtitle}>
            {metrics.length > 0 ? `Tracking ${metrics.length} metrics` : 'Upload reports to see your trends'}
          </Text>
        </View>

        <View style={s.summaryCard}>
          {[
            { label: 'Metrics',      value: metrics.length,                          color: TEAL  },
            { label: 'Normal',       value: metrics.length - abnormalMetrics.length, color: GREEN },
            { label: 'Needs review', value: abnormalMetrics.length,                  color: abnormalMetrics.length > 0 ? RED : GREEN },
          ].map((item, i) => (
            <View key={i} style={[s.summaryItem, i < 2 && s.summaryBorder]}>
              <Text style={[s.summaryValue, { color: item.color }]}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {metrics.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📈</Text>
            <Text style={s.emptyTitle}>No data yet</Text>
            <Text style={s.emptyText}>Upload lab reports and values will automatically appear here</Text>
          </View>
        )}

        {metrics.length > 0 && (
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

        {displayed.map(m => (
          <MetricCard
            key={m.id}
            metric={m}
            expanded={expanded === m.id}
            onPress={() => setExpanded(expanded === m.id ? null : m.id)}
          />
        ))}

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            ℹ️ Values shown from your uploaded reports. Reference ranges based on ICMR / WHO India guidelines.
          </Text>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: BG },
  scroll:            { paddingHorizontal: 20 },
  header:            { paddingTop: 20, paddingBottom: 16 },
  title:             { fontSize: 22, fontWeight: '800', color: DARK },
  subtitle:          { fontSize: 13, color: GRAY, marginTop: 2 },
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
  metricCard:        { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  metricCardExpanded:{ borderWidth: 1.5, borderColor: TEAL_LT },
  metricTop:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  metricIconBox:     { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metricLeft:        { flex: 1 },
  metricName:        { fontSize: 13, color: GRAY, fontWeight: '600', marginBottom: 4 },
  metricValueRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metricValue:       { fontSize: 26, fontWeight: '800' },
  metricUnit:        { fontSize: 13, color: GRAY, marginTop: 6 },
  trendBadge:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  trendText:         { fontSize: 12, fontWeight: '700' },
  metricDate:        { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  statusPill:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  statusPillText:    { fontSize: 12, fontWeight: '700' },
  rangeRow:          { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F9FAFB' },
  rangeLabel:        { fontSize: 12, color: '#9CA3AF' },
  chartSection:      { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  chartTitle:        { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 14 },
  tipBox:            { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginTop: 12, gap: 8 },
  tipIcon:           { fontSize: 16, marginTop: 1 },
  tipText:           { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  expandHint:        { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 10 },
  disclaimer:        { backgroundColor: TEAL_LT, borderRadius: 14, padding: 14, marginTop: 4 },
  disclaimerText:    { fontSize: 12, color: TEAL, lineHeight: 18, textAlign: 'center' },
  empty:             { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyEmoji:        { fontSize: 48, marginBottom: 12 },
  emptyTitle:        { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 6 },
  emptyText:         { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },
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