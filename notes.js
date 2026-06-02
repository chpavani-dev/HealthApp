// ====================================================================
// notes.js — Notes service module
// ====================================================================
//
// Two note types: 'personal' and 'doctor'
// Each note belongs to a family member, has a note_date (when it happened),
// and a content body. Doctor notes can optionally have a doctor_name.
//
// Schema:
//   id (text PK), member_id (text FK), author_id (uuid),
//   note_type ('personal'|'doctor'), content (text),
//   note_date (date), doctor_name (text nullable),
//   audio_url (text nullable, Phase 2), has_audio (boolean, Phase 2),
//   created_at, updated_at
//
// RLS: uses can_access_member / can_edit_member from sharing.
// ====================================================================

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

// ====================================================================
// Helpers
// ====================================================================

async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

function generateNoteId() {
  return 'note_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function todayISO() {
  return new Date().toISOString().split('T')[0];  // YYYY-MM-DD
}

// ====================================================================
// Create a new note
//   memberId: family member to attach the note to
//   noteType: 'personal' or 'doctor'
//   content: note body text
//   noteDate: ISO date string YYYY-MM-DD (defaults to today)
//   doctorName: optional, used only for doctor notes
//
// Returns { error, note }
// ====================================================================

export async function createNote(memberId, noteType, content, noteDate, doctorName) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in' };
  if (!memberId) return { error: 'no_member' };
  if (!content || !content.trim()) return { error: 'empty_content' };
  if (!['personal', 'doctor'].includes(noteType)) {
    return { error: 'invalid_note_type' };
  }

  const note = {
    id:           generateNoteId(),
    member_id:    memberId,
    author_id:    userId,
    note_type:    noteType,
    content:      content.trim(),
    note_date:    noteDate || todayISO(),
    doctor_name:  (noteType === 'doctor' && doctorName) ? doctorName.trim() : null,
    audio_url:    null,
    has_audio:    false,
  };

  const { data, error } = await supabase
    .from('notes')
    .insert(note)
    .select()
    .single();

  if (error) {
    console.warn('[notes] createNote failed:', error.message);
    return { error: error.message };
  }

  return { error: null, note: data };
}

// ====================================================================
// List notes for a member, filtered by type
//   noteType: 'personal' | 'doctor' | null (all)
//   Returns { error, notes } — sorted by note_date DESC, then created_at DESC
// ====================================================================

export async function listNotes(memberId, noteType) {
  if (!memberId) return { error: 'no_member', notes: [] };

  let query = supabase
    .from('notes')
    .select('*')
    .eq('member_id', memberId)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (noteType && ['personal', 'doctor'].includes(noteType)) {
    query = query.eq('note_type', noteType);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[notes] listNotes failed:', error.message);
    return { error: error.message, notes: [] };
  }

  return { error: null, notes: data || [] };
}

// ====================================================================
// Update an existing note
//   noteId: id of the note to update
//   updates: partial object with fields to change (content, note_date, doctor_name)
//   Returns { error, note }
// ====================================================================

export async function updateNote(noteId, updates) {
  if (!noteId) return { error: 'no_note_id' };
  if (!updates || typeof updates !== 'object') return { error: 'no_updates' };

  const allowed = {};
  if (typeof updates.content === 'string') allowed.content = updates.content.trim();
  if (typeof updates.note_date === 'string') allowed.note_date = updates.note_date;
  if (typeof updates.doctor_name === 'string' || updates.doctor_name === null) {
    allowed.doctor_name = updates.doctor_name ? updates.doctor_name.trim() : null;
  }

  if (Object.keys(allowed).length === 0) {
    return { error: 'nothing_to_update' };
  }

  const { data, error } = await supabase
    .from('notes')
    .update(allowed)
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    console.warn('[notes] updateNote failed:', error.message);
    return { error: error.message };
  }

  return { error: null, note: data };
}

// ====================================================================
// Delete a note
//   Returns { error }
// ====================================================================

export async function deleteNote(noteId) {
  if (!noteId) return { error: 'no_note_id' };

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    console.warn('[notes] deleteNote failed:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ====================================================================
// Count notes for a member by type (for badge/stats)
// ====================================================================

export async function countNotes(memberId) {
  if (!memberId) return { error: 'no_member', personal: 0, doctor: 0 };

  const { data, error } = await supabase
    .from('notes')
    .select('note_type')
    .eq('member_id', memberId);

  if (error) {
    return { error: error.message, personal: 0, doctor: 0 };
  }

  let personal = 0, doctor = 0;
  for (const row of (data || [])) {
    if (row.note_type === 'personal') personal++;
    else if (row.note_type === 'doctor') doctor++;
  }

  return { error: null, personal, doctor };
}
// ====================================================================
// Audio upload to Supabase Storage
// ====================================================================
//
// Uploads an audio file to the 'note-audio' bucket.
// File path: {member_id}/{note_id}.m4a
// Returns { error, url } — url is the signed URL valid for 7 days
// ====================================================================

export async function uploadNoteAudio(memberId, noteId, fileUri) {
  if (!memberId || !noteId || !fileUri) {
    return { error: 'missing_params' };
  }

  try {
    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to ArrayBuffer using a manual decoder
    // (atob isn't reliable on Android React Native)
    const binaryString = decodeBase64(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filePath = `${memberId}/${noteId}.m4a`;
    const { error: uploadError } = await supabase.storage
      .from('note-audio')
      .upload(filePath, bytes, {
        contentType: 'audio/m4a',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[notes] uploadNoteAudio failed:', uploadError.message);
      return { error: uploadError.message };
    }

    return { error: null, url: filePath };
  } catch (e) {
    console.warn('[notes] uploadNoteAudio threw:', e?.message);
    return { error: e?.message || 'upload_failed' };
  }
}

// ====================================================================
// Base64 decoder (works in React Native without atob)
// ====================================================================

function decodeBase64(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  
  // Remove padding chars
  const cleaned = base64.replace(/=+$/, '');
  
  for (let i = 0; i < cleaned.length;) {
    const e1 = chars.indexOf(cleaned[i++]);
    const e2 = chars.indexOf(cleaned[i++]);
    const e3 = chars.indexOf(cleaned[i++]);
    const e4 = chars.indexOf(cleaned[i++]);
    
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    
    output += String.fromCharCode(c1);
    if (e3 !== -1) output += String.fromCharCode(c2);
    if (e4 !== -1) output += String.fromCharCode(c3);
  }
  
  return output;
}
// ====================================================================
// Get a signed URL for playback (valid 1 hour)
// ====================================================================

export async function getAudioSignedUrl(filePath) {
  if (!filePath) return { error: 'no_path', url: null };

  const { data, error } = await supabase.storage
    .from('note-audio')
    .createSignedUrl(filePath, 3600);  // 1 hour

  if (error) {
    console.warn('[notes] getAudioSignedUrl failed:', error.message);
    return { error: error.message, url: null };
  }

  return { error: null, url: data?.signedUrl };
}

// ====================================================================
// Delete an audio file from storage (when note is deleted)
// ====================================================================

export async function deleteNoteAudio(filePath) {
  if (!filePath) return { error: null };

  const { error } = await supabase.storage
    .from('note-audio')
    .remove([filePath]);

  if (error) {
    console.warn('[notes] deleteNoteAudio failed:', error.message);
    return { error: error.message };
  }

  return { error: null };
}
