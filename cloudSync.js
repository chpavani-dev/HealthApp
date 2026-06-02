// ====================================================================
// cloudSync.js — bidirectional sync between AsyncStorage ↔ Supabase
// ====================================================================
//
// Strategy: AsyncStorage-first (local-first)
//   - Writes go to AsyncStorage immediately (synchronous UI feel)
//   - cloudSync runs in background to push to Supabase
//   - On app open, cloudSync pulls fresh data and merges to AsyncStorage
//
// Storage key convention: uses key('type', memberId) from storage.js
//   — guarantees same keys as the rest of the app.
//
// Timeline structure bridge:
//   - Local shape: { metricId: [{date, value}, ...], ... }  (grouped object)
//   - Supabase shape: rows of (id, member_id, metric_id, value, date)
//   - Bridge: deterministic id = `${memberId}_${metricId}_${date}` so
//     repeated pushes are idempotent.
// ====================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { key } from './storage';

// ====================================================================
// State
// ====================================================================

let syncing = false;
let lastSyncedAt = null;

export function isSyncing() { return syncing; }
export function getLastSyncedAt() { return lastSyncedAt; }

const K_MEMBERS = 'members';
const K_LAST_SYNC = 'cloudSync_lastSyncedAt';

// ====================================================================
// Row mappers
// ====================================================================

// ---- family_members ----
function memberToSupabase(member, userId) {
  return {
    id:            member.id,
    owner_user_id: userId,
    name:          member.name,
    relation:      member.relation || null,
    age:           member.age != null ? String(member.age) : null,
    gender:        member.gender || null,
    location:      member.location || null,
    avatar_color:  member.avatarColor || member.avatar_color || null,
    updated_at:    new Date().toISOString(),
  };
}

function memberFromSupabase(row) {
  return {
    id:           row.id,
    name:         row.name,
    relation:     row.relation,
    age:          row.age,
    gender:       row.gender,
    location:     row.location,
    avatarColor:  row.avatar_color,
    updated_at:   row.updated_at,
    created_at:   row.created_at,
  };
}

// ---- lab_reports ----
function labReportToSupabase(report, memberId) {
  return {
    id:             report.id,
    member_id:      memberId,
    name:           report.name || 'Lab Report',
    lab:            report.lab || null,
    date:           report.date || null,
    category:       report.category || 'Blood',
    tests:          report.tests || [],
    abnormal_count: report.abnormalCount || 0,
    test_count:     report.testCount || (Array.isArray(report.tests) ? report.tests.length : 0),
    status:         report.status || 'normal',
    patient_name:   report.patientName || null,
    image_url:      report.imageUrl || null,
    file_type:      report.fileType || null,
    file_name:      report.fileName || null,
    uploaded_at:    report.uploadedAt || new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  };
}

function labReportFromSupabase(row) {
  return {
    id:            row.id,
    name:          row.name,
    lab:           row.lab,
    date:          row.date,
    category:      row.category,
    tests:         row.tests || [],
    abnormalCount: row.abnormal_count,
    testCount:     row.test_count,
    status:        row.status,
    patientName:   row.patient_name,
    imageUrl:      row.image_url,
    fileType:      row.file_type,
    fileName:      row.file_name,
    uploadedAt:    row.uploaded_at,
    updated_at:    row.updated_at,
    created_at:    row.created_at,
  };
}

// ---- prescriptions ----
function prescriptionToSupabase(rx, memberId) {
  return {
    id:                rx.id,
    member_id:         memberId,
    drug:              rx.drug || 'Unknown',
    dose:              rx.dose || null,
    freq:              rx.freq || null,
    freq_label:        rx.freqLabel || null,
    times:             rx.times || [],
    duration:          rx.duration || null,
    days_left:         rx.daysLeft != null ? rx.daysLeft : null,
    route:             rx.route || 'oral',
    type:              rx.type || 'outpatient',
    category:          rx.category || 'Other',
    notes:             rx.notes || null,
    handwritten:       rx.handwritten === true,
    active:            rx.active !== false,
    prescription_date: rx.prescriptionDate || null,
    doctor_name:       rx.doctorName || null,
    hospital_name:     rx.hospitalName || null,
    image_url:         rx.imageUrl || null,
    uploaded_at:       rx.uploadedAt || new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  };
}

function prescriptionFromSupabase(row) {
  return {
    id:                row.id,
    drug:              row.drug,
    dose:              row.dose,
    freq:              row.freq,
    freqLabel:         row.freq_label,
    times:             row.times || [],
    duration:          row.duration,
    daysLeft:          row.days_left,
    route:             row.route,
    type:              row.type,
    category:          row.category,
    notes:             row.notes,
    handwritten:       row.handwritten,
    active:            row.active,
    prescriptionDate:  row.prescription_date,
    doctorName:        row.doctor_name,
    hospitalName:      row.hospital_name,
    imageUrl:          row.image_url,
    uploadedAt:        row.uploaded_at,
    updated_at:        row.updated_at,
    created_at:        row.created_at,
  };
}

// ---- timeline_entries ----
// Local shape:   { metricId: [{ date, value }, ...], ... }
// Supabase row:  { id, member_id, metric_id, value, date, source_report_id, created_at }
//
// Deterministic id = `${memberId}__${metricId}__${date}` ensures idempotency.

function timelineRowId(memberId, metricId, date) {
  return `${memberId}__${metricId}__${date}`;
}

function timelineEntryToSupabase(memberId, metricId, date, value) {
  return {
    id:               timelineRowId(memberId, metricId, date),
    member_id:        memberId,
    metric_id:        metricId,
    value:            value,
    date:             date,
    source_report_id: null,
  };
}
export async function pushNote(note, memberId) {
  if (!memberId || memberId === 'default') return { error: 'no_member', count: 0 };
  if (!note?.id) return { error: 'no_note_id', count: 0 };

  // Note rows already use Supabase column names (no converter needed)
  const row = {
    id:          note.id,
    member_id:   memberId,
    author_id:   note.author_id,
    note_type:   note.note_type || 'personal',
    content:     note.content,
    note_date:   note.note_date,
    doctor_name: note.doctor_name || null,
    audio_url:   note.audio_url || null,
    has_audio:   note.has_audio === true,
    updated_at:  new Date().toISOString(),
  };

  return safeUpsert('notes', [row]);
}

// Flatten the grouped object into an array of Supabase rows
function flattenTimelineForSupabase(timelineObj, memberId) {
  const rows = [];
  for (const metricId of Object.keys(timelineObj || {})) {
    const entries = timelineObj[metricId];
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e || typeof e.value !== 'number' || !e.date) continue;
      rows.push(timelineEntryToSupabase(memberId, metricId, e.date, e.value));
    }
  }
  return rows;
}

// Group Supabase rows back into local object shape, sorted by date
function groupTimelineFromSupabase(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!row?.metric_id) continue;
    if (!grouped[row.metric_id]) grouped[row.metric_id] = [];
    grouped[row.metric_id].push({ date: row.date, value: row.value });
  }
  for (const metricId of Object.keys(grouped)) {
    grouped[metricId].sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  return grouped;
}

// ====================================================================
// PUSH primitives
// ====================================================================

async function safeUpsert(tableName, rows) {
  if (!rows || rows.length === 0) return { error: null, count: 0 };
  try {
    const { error } = await supabase
      .from(tableName)
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn(`[cloudSync] upsert ${tableName} failed:`, error.message);
      return { error, count: 0 };
    }
    return { error: null, count: rows.length };
  } catch (e) {
    console.warn(`[cloudSync] upsert ${tableName} threw:`, e.message);
    return { error: e, count: 0 };
  }
}

async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function pushFamilyMember(member) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in', count: 0 };
  return safeUpsert('family_members', [memberToSupabase(member, userId)]);
}

export async function pushLabReport(report, memberId) {
  if (!memberId || memberId === 'default') return { error: 'no_member', count: 0 };
  return safeUpsert('lab_reports', [labReportToSupabase(report, memberId)]);
}

export async function pushPrescription(rx, memberId) {
  if (!memberId || memberId === 'default') return { error: 'no_member', count: 0 };
  return safeUpsert('prescriptions', [prescriptionToSupabase(rx, memberId)]);
}

// Called from addTimelineEntry — one entry at a time
export async function pushTimelineEntry(metricId, value, date, memberId) {
  if (!memberId || memberId === 'default') return { error: 'no_member', count: 0 };
  if (typeof value !== 'number' || !date || !metricId) return { error: 'invalid', count: 0 };
  return safeUpsert('timeline_entries', [
    timelineEntryToSupabase(memberId, metricId, date, value)
  ]);
}

// ====================================================================
// DELETE primitives
// ====================================================================

async function safeDelete(tableName, id) {
  try {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) {
      console.warn(`[cloudSync] delete ${tableName} failed:`, error.message);
      return { error };
    }
    return { error: null };
  } catch (e) {
    console.warn(`[cloudSync] delete ${tableName} threw:`, e.message);
    return { error: e };
  }
}

export const deleteFamilyMemberCloud   = (id) => safeDelete('family_members', id);
export const deleteLabReportCloud      = (id) => safeDelete('lab_reports', id);
export const deletePrescriptionCloud   = (id) => safeDelete('prescriptions', id);
export const deleteNoteCloud           = (id) => safeDelete('notes', id);

// Timeline entries don't get individually deleted by the app today,
// but expose it for future use.
export const deleteTimelineEntryCloud = (memberId, metricId, date) =>
  safeDelete('timeline_entries', timelineRowId(memberId, metricId, date));

// ====================================================================
// PULL — read from Supabase, merge into AsyncStorage
// ====================================================================

async function pullMembers(userId) {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[cloudSync] pullMembers failed:', error.message);
    return [];
  }

  const remote = (data || []).map(memberFromSupabase);
  const localRaw = await AsyncStorage.getItem(K_MEMBERS);
  const local = localRaw ? JSON.parse(localRaw) : [];

  const merged = mergeById(local, remote);
  await AsyncStorage.setItem(K_MEMBERS, JSON.stringify(merged));
  return merged;
}

async function pullReportsForMember(memberId) {
  const { data, error } = await supabase
    .from('lab_reports')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) { console.warn(`[cloudSync] pull lab_reports failed:`, error.message); return; }

  const remote = (data || []).map(labReportFromSupabase);
  const storageKey = key('reports', memberId);
  const localRaw = await AsyncStorage.getItem(storageKey);
  const local = localRaw ? JSON.parse(localRaw) : [];
  const merged = mergeById(local, remote);
  await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
}

async function pullPrescriptionsForMember(memberId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) { console.warn(`[cloudSync] pull prescriptions failed:`, error.message); return; }

  const remote = (data || []).map(prescriptionFromSupabase);
  const storageKey = key('prescriptions', memberId);
  const localRaw = await AsyncStorage.getItem(storageKey);
  const local = localRaw ? JSON.parse(localRaw) : [];
  const merged = mergeById(local, remote);
  await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
}

async function pullTimelineForMember(memberId) {
  const { data, error } = await supabase
    .from('timeline_entries')
    .select('*')
    .eq('member_id', memberId)
    .order('date', { ascending: true });
  if (error) { console.warn(`[cloudSync] pull timeline_entries failed:`, error.message); return; }

async function pullNotesForMember(memberId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('member_id', memberId)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.warn(`[cloudSync] pull notes failed:`, error.message); return; }

  const remote = data || [];
  
  // Notes are stored in two local buckets — personal and doctor
  const personalRemote = remote.filter(n => n.note_type === 'personal');
  const doctorRemote   = remote.filter(n => n.note_type === 'doctor');

  // Personal notes
  const personalKey = key('notes_personal', memberId);
  const personalLocalRaw = await AsyncStorage.getItem(personalKey);
  const personalLocal = personalLocalRaw ? JSON.parse(personalLocalRaw) : [];
  const personalMerged = mergeById(personalLocal, personalRemote);
  await AsyncStorage.setItem(personalKey, JSON.stringify(personalMerged));

  // Doctor notes
  const doctorKey = key('notes_doctor', memberId);
  const doctorLocalRaw = await AsyncStorage.getItem(doctorKey);
  const doctorLocal = doctorLocalRaw ? JSON.parse(doctorLocalRaw) : [];
  const doctorMerged = mergeById(doctorLocal, doctorRemote);
  await AsyncStorage.setItem(doctorKey, JSON.stringify(doctorMerged));
}

  // Group Supabase rows back into local { metricId: [{date, value}, ...] } shape
  const remoteGrouped = groupTimelineFromSupabase(data || []);

  // Merge with local — for timeline, prefer remote (it's the merged source of truth for this user)
  // because timeline entries are append-only and don't have per-entry timestamps.
  const storageKey = key('timeline', memberId);
  const localRaw = await AsyncStorage.getItem(storageKey);
  const local = localRaw ? JSON.parse(localRaw) : {};

  const merged = { ...local };
  for (const metricId of Object.keys(remoteGrouped)) {
    // Combine local + remote entries, dedup by date (latest value wins per date)
    const byDate = new Map();
    for (const e of (local[metricId] || [])) {
      if (e?.date) byDate.set(e.date, e);
    }
    for (const e of remoteGrouped[metricId]) {
      byDate.set(e.date, e);  // remote wins on tie
    }
    merged[metricId] = Array.from(byDate.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
}

export async function pullAllForUser(userId) {
  if (!userId) return { error: 'no_user' };
  if (syncing) return { error: 'busy' };

  syncing = true;
  try {
    const members = await pullMembers(userId);

    for (const m of members) {
      if (!m.id || m.id === 'default') continue;
      await pullReportsForMember(m.id);
      await pullPrescriptionsForMember(m.id);
      await pullTimelineForMember(m.id);
      await pullNotesForMember(m.id);
    }

    lastSyncedAt = new Date().toISOString();
    await AsyncStorage.setItem(K_LAST_SYNC, lastSyncedAt);
    console.log(`[cloudSync] pullAllForUser complete — ${members.length} members synced`);
    return { error: null, members };
  } catch (e) {
    console.warn('[cloudSync] pullAllForUser threw:', e.message);
    return { error: e };
  } finally {
    syncing = false;
  }
}

// ====================================================================
// MIGRATION — first-time upload of existing AsyncStorage data
// ====================================================================

export async function migrateLocalToCloud(userId, onProgress) {
  if (!userId) return { error: 'no_user' };

  const report = {
    membersUploaded: 0,
    reportsUploaded: 0,
    prescriptionsUploaded: 0,
    timelineUploaded: 0,
    errors: [],
  };

  const membersRaw = await AsyncStorage.getItem(K_MEMBERS);
  const members = membersRaw ? JSON.parse(membersRaw) : [];

  if (members.length === 0) {
    console.log('[cloudSync] migrateLocalToCloud: no local data');
    return { error: null, report };
  }

  onProgress?.({ stage: 'members', done: 0, total: members.length });
  const memberRows = members.map(m => memberToSupabase(m, userId));
  const memberResult = await safeUpsert('family_members', memberRows);
  if (memberResult.error) report.errors.push('members: ' + memberResult.error.message);
  else report.membersUploaded = memberResult.count;
  onProgress?.({ stage: 'members', done: members.length, total: members.length });

  let memberIdx = 0;
  for (const m of members) {
    memberIdx++;
    if (!m.id || m.id === 'default') continue;

    onProgress?.({
      stage: 'member_data',
      done: memberIdx,
      total: members.length,
      memberName: m.name,
    });

    // Lab reports
    const reportsRaw = await AsyncStorage.getItem(key('reports', m.id));
    const reports = reportsRaw ? JSON.parse(reportsRaw) : [];
    if (reports.length > 0) {
      const rows = reports.map(r => labReportToSupabase(r, m.id));
      const res = await safeUpsert('lab_reports', rows);
      if (res.error) report.errors.push(`reports for ${m.name}: ${res.error.message}`);
      else report.reportsUploaded += res.count;
    }

    // Prescriptions
    const rxRaw = await AsyncStorage.getItem(key('prescriptions', m.id));
    const rxList = rxRaw ? JSON.parse(rxRaw) : [];
    if (rxList.length > 0) {
      const rows = rxList.map(r => prescriptionToSupabase(r, m.id));
      const res = await safeUpsert('prescriptions', rows);
      if (res.error) report.errors.push(`prescriptions for ${m.name}: ${res.error.message}`);
      else report.prescriptionsUploaded += res.count;
    }

    // Timeline entries (grouped object → flat rows)
    const tlRaw = await AsyncStorage.getItem(key('timeline', m.id));
    const tlObj = tlRaw ? JSON.parse(tlRaw) : {};
    const tlRows = flattenTimelineForSupabase(tlObj, m.id);
    if (tlRows.length > 0) {
      const res = await safeUpsert('timeline_entries', tlRows);
      if (res.error) report.errors.push(`timeline for ${m.name}: ${res.error.message}`);
      else report.timelineUploaded += res.count;
    }
  }

  console.log('[cloudSync] migrateLocalToCloud complete:', report);
  return { error: null, report };
}

// ====================================================================
// Conflict resolution — merge two lists by id, prefer newer updated_at
// ====================================================================

function mergeById(localList, remoteList) {
  const byId = new Map();

  for (const item of localList) {
    if (item?.id) byId.set(item.id, item);
  }

  for (const remote of remoteList) {
    if (!remote?.id) continue;
    const local = byId.get(remote.id);
    if (!local) {
      byId.set(remote.id, remote);
    } else {
      const localTs = local.updated_at || local.created_at || 0;
      const remoteTs = remote.updated_at || remote.created_at || 0;
      if (remoteTs >= localTs) byId.set(remote.id, remote);
    }
  }

  return Array.from(byId.values());
}
