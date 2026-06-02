// ====================================================================
// NotesScreen.js — Notes tab with Personal/Doctor sub-tabs
// ====================================================================
//
// Features:
//   - Two tabs: Personal | Doctor
//   - Chronological list of notes (most recent note_date first)
//   - + Add button (hidden when view-only)
//   - Add Modal: date field (defaults today), content textarea, doctor name (if doctor type)
//   - Edit / Delete per note (hidden when view-only)
//   - View-only banner when permission='view'
// ====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getNotes, addNote, deleteNote, updateNoteLocal } from '../storage';
import { usePermission } from '../PermissionContext';
import ViewOnlyBanner from '../ViewOnlyBanner';
import { supabase } from '../supabase';
import { Audio } from 'expo-av';
import { uploadNoteAudio, getAudioSignedUrl, deleteNoteAudio } from '../notes';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E0F2F5';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const LIGHT   = '#F3F4F6';
const BORDER  = '#E5E7EB';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatDateDisplay(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function generateNoteId() {
  return 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// ====================================================================
// Add/Edit Note Modal
// ====================================================================
function NoteFormModal({ visible, mode, noteType, initial, memberId, onSave, onClose }) {
  const [inputMode, setInputMode]   = useState('text');  // 'text' | 'voice'
  const [content, setContent]       = useState('');
  const [noteDate, setNoteDate]     = useState(todayISO());
  const [doctorName, setDoctorName] = useState('');
  const [saving, setSaving]         = useState(false);

  // Voice recording state
  const [recording, setRecording]   = useState(null);
  const [recordedUri, setRecordedUri] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [playback, setPlayback]     = useState(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  useEffect(() => {
    if (visible) {
      setContent(initial?.content || '');
      setNoteDate(initial?.note_date || todayISO());
      setDoctorName(initial?.doctor_name || '');
      setSaving(false);
      // Reset voice state
      setInputMode(initial?.has_audio ? 'voice' : 'text');
      setRecordedUri(null);
      setRecordTime(0);
      setIsRecording(false);
      setIsPlaying(false);
    } else {
      // Cleanup on close
      if (recording) recording.stopAndUnloadAsync().catch(() => {});
      if (playback) playback.unloadAsync().catch(() => {});
    }
  }, [visible, initial]);

// Recording timer (1Hz tick, auto-stop at 60s)
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordTime(t => {
        const next = t + 1;
        if (next >= 60) {
          stopRecording();
          return 60;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Microphone permission needed', 'Please grant microphone access to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordTime(0);
    } catch (err) {
      console.warn('startRecording failed:', err);
      Alert.alert('Recording failed', String(err?.message || err));
    }
  }

  async function stopRecording() {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setIsRecording(false);
      setRecording(null);
    } catch (err) {
      console.warn('stopRecording failed:', err);
    }
  }

  async function playRecording() {
    if (!recordedUri) return;
    try {
      if (playback) {
        await playback.unloadAsync();
        setPlayback(null);
      }
      const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
          setPlayback(null);
        }
      });
      setPlayback(sound);
      setIsPlaying(true);
      await sound.playAsync();
    } catch (err) {
      console.warn('playRecording failed:', err);
    }
  }

  async function stopPlayback() {
    if (playback) {
      await playback.stopAsync();
      await playback.unloadAsync();
      setPlayback(null);
      setIsPlaying(false);
    }
  }

  function discardRecording() {
    setRecordedUri(null);
    setRecordTime(0);
    if (playback) {
      playback.unloadAsync();
      setPlayback(null);
      setIsPlaying(false);
    }
  }
 async function handleSave() {
    // Validate input based on mode
    if (inputMode === 'text') {
      if (!content.trim()) {
        Alert.alert('Content required', 'Please enter some text for the note.');
        return;
      }
    } else {
      if (!recordedUri) {
        Alert.alert('Recording required', 'Please record a voice note first.');
        return;
      }
    }

    if (!noteDate || !/^\d{4}-\d{2}-\d{2}$/.test(noteDate)) {
      Alert.alert('Invalid date', 'Please enter date as YYYY-MM-DD (e.g., 2026-05-30).');
      return;
    }

    setSaving(true);

    // For voice notes, upload the audio first
    let audioUrl = null;
    let hasAudio = false;
    if (inputMode === 'voice' && recordedUri) {
      // Generate a temporary noteId for the audio filename
      const tempId = initial?.id || ('note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
      const result = await uploadNoteAudio(memberId, tempId, recordedUri);
      if (result.error) {
        setSaving(false);
        Alert.alert('Upload failed', `Could not upload audio: ${result.error}`);
        return;
      }
      audioUrl = result.url;
      hasAudio = true;
    }

    await onSave({
      content: inputMode === 'voice' ? `🎤 Voice note (${recordTime}s)` : content.trim(),
      note_date: noteDate,
      doctor_name: noteType === 'doctor' && doctorName.trim() ? doctorName.trim() : null,
      audio_url: audioUrl,
      has_audio: hasAudio,
    });

    setSaving(false);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.handle} />
          <View style={m.header}>
            <Text style={m.title}>
              {mode === 'edit' ? 'Edit' : 'Add'} {noteType === 'doctor' ? 'Doctor' : 'Personal'} Note
            </Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <Text style={m.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
            <Text style={m.label}>Date it happened</Text>
            <View style={m.dateRow}>
              <TextInput
                style={[m.input, { flex: 1 }]}
                value={noteDate}
                onChangeText={setNoteDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={10}
              />
              <TouchableOpacity style={m.todayBtn} onPress={() => setNoteDate(todayISO())}>
                <Text style={m.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>
            <Text style={m.hint}>Format: YYYY-MM-DD</Text>

            {noteType === 'doctor' && (
              <>
                <Text style={[m.label, { marginTop: 16 }]}>Doctor's name (optional)</Text>
                <TextInput
                  style={m.input}
                  value={doctorName}
                  onChangeText={setDoctorName}
                  placeholder="e.g., Dr. Sharma"
                  placeholderTextColor="#9CA3AF"
                />
              </>
            )}

           <Text style={[m.label, { marginTop: 16 }]}>Notes</Text>

            {/* Type/Voice toggle */}
            <View style={m.modeToggle}>
              <TouchableOpacity
                style={[m.modeBtn, inputMode === 'text' && m.modeBtnActive]}
                onPress={() => setInputMode('text')}
              >
                <Text style={[m.modeBtnText, inputMode === 'text' && m.modeBtnTextActive]}>
                  ⌨️ Type
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.modeBtn, inputMode === 'voice' && m.modeBtnActive]}
                onPress={() => setInputMode('voice')}
              >
                <Text style={[m.modeBtnText, inputMode === 'voice' && m.modeBtnTextActive]}>
                  🎤 Voice
                </Text>
              </TouchableOpacity>
            </View>

            {inputMode === 'text' ? (
              <TextInput
                style={[m.input, m.textarea]}
                value={content}
                onChangeText={setContent}
                placeholder={
                  noteType === 'doctor'
                    ? "What did the doctor say? Diagnosis, prescription notes, recommendations..."
                    : "Observations, symptoms, changes you've noticed..."
                }
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            ) : (
              <View style={m.voiceBox}>
                {!recordedUri && !isRecording && (
                  <>
                    <Text style={m.voiceHint}>Tap the microphone to start recording (max 60 seconds)</Text>
                    <TouchableOpacity style={m.recordBtn} onPress={startRecording}>
                      <Text style={m.recordBtnIcon}>🎤</Text>
                    </TouchableOpacity>
                    <Text style={m.voiceLabel}>Tap to record</Text>
                  </>
                )}

                {isRecording && (
                  <>
                    <Text style={m.voiceHint}>Recording...</Text>
                    <TouchableOpacity style={[m.recordBtn, m.recordBtnActive]} onPress={stopRecording}>
                      <Text style={m.recordBtnIcon}>⏹️</Text>
                    </TouchableOpacity>
                    <Text style={m.voiceTime}>
                      {Math.floor(recordTime / 60)}:{String(recordTime % 60).padStart(2, '0')} / 1:00
                    </Text>
                  </>
                )}

                {recordedUri && !isRecording && (
                  <>
                    <Text style={m.voiceHint}>Voice note ready ({recordTime}s)</Text>
                    <View style={m.playRow}>
                      <TouchableOpacity
                        style={m.playBtn}
                        onPress={isPlaying ? stopPlayback : playRecording}
                      >
                        <Text style={m.playBtnIcon}>{isPlaying ? '⏸️' : '▶️'}</Text>
                        <Text style={m.playBtnText}>{isPlaying ? 'Stop' : 'Play'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={m.discardBtn} onPress={discardRecording}>
                        <Text style={m.discardBtnText}>🗑️ Discard</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
            <TouchableOpacity
              style={[m.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={m.saveBtnText}>{mode === 'edit' ? 'Save Changes' : 'Save Note'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ====================================================================
// Note Card
// ====================================================================
function NoteCard({ note, canEdit, onEdit, onDelete }) {
  const [sound, setSound]       = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [sound]);

  async function handlePlay() {
    if (isPlaying && sound) {
      await sound.stopAsync();
      setIsPlaying(false);
      return;
    }
    if (sound) {
      await sound.playFromPositionAsync(0);
      setIsPlaying(true);
      return;
    }
    setLoading(true);
    try {
      const result = await getAudioSignedUrl(note.audio_url);
      if (result.error || !result.url) {
        Alert.alert('Playback failed', `Could not load audio: ${result.error || 'no_url'}`);
        setLoading(false);
        return;
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: result.url });
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });
      setSound(newSound);
      setIsPlaying(true);
      await newSound.playAsync();
    } catch (err) {
      console.warn('Playback failed:', err);
      Alert.alert('Playback failed', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardDate}>{formatDateDisplay(note.note_date)}</Text>
        {note.doctor_name && (
          <Text style={s.cardDoctor}>· {note.doctor_name}</Text>
        )}
      </View>

      {note.has_audio ? (
        <TouchableOpacity style={s.audioBtn} onPress={handlePlay} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={TEAL} />
          ) : (
            <>
              <Text style={s.audioBtnIcon}>{isPlaying ? '⏸️' : '▶️'}</Text>
              <Text style={s.audioBtnText}>
                {isPlaying ? 'Stop' : 'Play'} voice note
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={s.cardContent}>{note.content}</Text>
      )}

      {canEdit && (
        <View style={s.cardActions}>
          {!note.has_audio && (
            <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(note)}>
              <Text style={s.actionBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={() => onDelete(note)}>
            <Text style={[s.actionBtnText, { color: '#DC2626' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
// ====================================================================
// Main Notes Screen
// ====================================================================
export default function NotesScreen({ activeMember }) {
  const { canEdit } = usePermission();
  const memberId = activeMember?.id || 'default';

  const [activeTab, setActiveTab]       = useState('personal');  // 'personal' | 'doctor'
  const [notes, setNotes]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote]   = useState(null);

  const loadNotes = useCallback(async () => {
    if (!memberId || memberId === 'default') {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getNotes(memberId, activeTab);
    setNotes(data);
    setLoading(false);
  }, [memberId, activeTab]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  function handleOpenAdd() {
    setEditingNote(null);
    setModalVisible(true);
  }

  function handleOpenEdit(note) {
    setEditingNote(note);
    setModalVisible(true);
  }

  async function handleSave(formData) {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Error', 'Not signed in.');
      return;
    }

    if (editingNote) {
      await updateNoteLocal(editingNote.id, memberId, activeTab, formData);
    } else {
      const newNote = {
        id:           generateNoteId(),
        member_id:    memberId,
        author_id:    userId,
        note_type:    activeTab,
        content:      formData.content,
        note_date:    formData.note_date,
        doctor_name:  formData.doctor_name,
        audio_url:    formData.audio_url || null,
      has_audio:    formData.has_audio === true,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      };
      await addNote(newNote, memberId);
    }

    setModalVisible(false);
    setEditingNote(null);
    loadNotes();
  }

 function handleDelete(note) {
    Alert.alert(
      'Delete note?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          // Clean up audio file from Supabase Storage if it's a voice note
          if (note.has_audio && note.audio_url) {
            deleteNoteAudio(note.audio_url).catch(() => {});
          }
          await deleteNote(note.id, memberId, activeTab);
          loadNotes();
        }},
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ViewOnlyBanner memberName={activeMember?.name} />

      <View style={s.header}>
        <View>
          <Text style={s.title}>Notes</Text>
          <Text style={s.subtitle}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            {activeMember ? `  ·  ${activeMember.name}` : ''}
          </Text>
        </View>
        {canEdit && (
          <TouchableOpacity style={s.addBtn} onPress={handleOpenAdd}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'personal' && s.tabActive]}
          onPress={() => setActiveTab('personal')}
        >
          <Text style={[s.tabText, activeTab === 'personal' && s.tabTextActive]}>
            Personal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'doctor' && s.tabActive]}
          onPress={() => setActiveTab('doctor')}
        >
          <Text style={[s.tabText, activeTab === 'doctor' && s.tabTextActive]}>
            Doctor
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.list} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 90 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={s.empty}>
            <ActivityIndicator color={TEAL} />
          </View>
        ) : notes.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📝</Text>
            <Text style={s.emptyTitle}>
              No {activeTab === 'doctor' ? 'doctor' : 'personal'} notes yet
            </Text>
            <Text style={s.emptyText}>
              {canEdit
                ? `Tap + Add to record ${activeTab === 'doctor' ? 'what the doctor said' : 'your observations'}.`
                : 'No notes shared yet.'}
            </Text>
          </View>
        ) : (
          notes.map(n => (
            <NoteCard
              key={n.id}
              note={n}
              canEdit={canEdit}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </ScrollView>

      <NoteFormModal
        visible={modalVisible}
        mode={editingNote ? 'edit' : 'add'}
        noteType={activeTab}
        initial={editingNote}
        memberId={memberId}
        onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditingNote(null); }}
      />
    </SafeAreaView>
  );
}

// ====================================================================
// Styles
// ====================================================================
const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F5F7FA' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title:     { fontSize: 26, fontWeight: '800', color: DARK },
  subtitle:  { fontSize: 13, color: GRAY, marginTop: 2 },
  addBtn:    { backgroundColor: TEAL, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText:{ color: '#FFF', fontSize: 14, fontWeight: '700' },

  tabRow:    { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  tab:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: BORDER },
  tabActive: { backgroundColor: TEAL_LT, borderColor: TEAL },
  tabText:   { fontSize: 14, fontWeight: '600', color: GRAY },
  tabTextActive: { color: TEAL },

  list:      { flex: 1, marginTop: 12 },
  empty:     { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji:{ fontSize: 48, marginBottom: 12 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 4 },
  emptyText: { fontSize: 13, color: GRAY, textAlign: 'center', paddingHorizontal: 32 },

  card:      { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  cardHeader:{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  cardDate:  { fontSize: 13, fontWeight: '700', color: TEAL },
  cardDoctor:{ fontSize: 12, color: GRAY, marginLeft: 6 },
  cardContent: { fontSize: 14, color: DARK, lineHeight: 20 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 8 },
  actionBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: LIGHT },
  deleteBtn:   { backgroundColor: '#FEE2E2' },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: GRAY },

  // Audio playback button on cards
  audioBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: TEAL_LT, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, marginVertical: 4, gap: 10 },
  audioBtnIcon:  { fontSize: 20 },
  audioBtnText:  { fontSize: 14, fontWeight: '600', color: TEAL },
});

const m = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:      { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%' },
  handle:     { width: 40, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700', color: DARK, flex: 1 },
  closeBtn:   { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 18, color: GRAY },
  body:       {},
  label:      { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  hint:       { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  input:      { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: DARK, backgroundColor: '#F9FAFB' },
  textarea:   { minHeight: 140, textAlignVertical: 'top' },
  dateRow:    { flexDirection: 'row', gap: 8 },
  todayBtn:   { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: TEAL_LT, alignItems: 'center', justifyContent: 'center' },
  todayBtnText: { fontSize: 13, fontWeight: '700', color: TEAL },
  saveBtn:    { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText:{ fontSize: 15, fontWeight: '700', color: '#FFF' },
  cancelBtn:  { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: GRAY },

  // Voice recording UI
  modeToggle:       { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  modeBtnActive:    { backgroundColor: TEAL_LT, borderColor: TEAL },
  modeBtnText:      { fontSize: 14, fontWeight: '600', color: GRAY },
  modeBtnTextActive:{ color: TEAL },
  voiceBox:         { alignItems: 'center', paddingVertical: 24, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  voiceHint:        { fontSize: 13, color: GRAY, marginBottom: 16, textAlign: 'center', paddingHorizontal: 16 },
  voiceLabel:       { fontSize: 12, color: GRAY, marginTop: 12 },
  voiceTime:        { fontSize: 16, fontWeight: '700', color: TEAL, marginTop: 12 },
  recordBtn:        { width: 80, height: 80, borderRadius: 40, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  recordBtnActive:  { backgroundColor: '#DC2626' },
  recordBtnIcon:    { fontSize: 36 },
  playRow:          { flexDirection: 'row', gap: 12, marginTop: 8 },
  playBtn:          { flexDirection: 'row', alignItems: 'center', backgroundColor: TEAL, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, gap: 8 },
  playBtnIcon:      { fontSize: 18 },
  playBtnText:      { color: '#FFF', fontSize: 14, fontWeight: '700' },
  discardBtn:       { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FEE2E2' },
  discardBtnText:   { color: '#DC2626', fontSize: 14, fontWeight: '700' },
});
