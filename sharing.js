// ====================================================================
// sharing.js — Family member sharing service
// ====================================================================
//
// How it works:
//   1. Owner creates an invite for a member → generates 6-char code MR-XXXXXX
//   2. Owner shares code with invitee via WhatsApp (manual paste or share button)
//   3. Invitee enters code in app → creates member_shares row
//
// Permission levels:
//   view  — read-only access to records
//   edit  — can add/edit records
//   admin — can edit AND re-share with others
//
// Schema reminders:
//   share_invites:  id, member_id, shared_by, invite_phone, permission,
//                   token, status ('pending'|'accepted'|'expired'),
//                   expires_at, created_at, accepted_at
//   member_shares:  id, member_id, shared_by, shared_with, permission,
//                   status ('pending'|'active'|'revoked'),
//                   invited_at, accepted_at, revoked_at
// ====================================================================

import { supabase } from './supabase';

// ====================================================================
// Code generation: MR-XXXXXX (8 chars, alphanumeric, uppercase)
// ====================================================================

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no 0/O/I/1 confusion

function generateInviteCode() {
  let code = 'MR-';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

async function getCurrentUserPhone() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.phone || null;
}

// ====================================================================
// Create an invite
//   memberId: family member to share access to
//   invitePhone: who to invite (E.164 format like +919876543210)
//   permission: 'view' | 'edit' | 'admin'
//
// Returns { error, code, invite }
// ====================================================================

export async function createInvite(memberId, invitePhone, permission) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in' };
  if (!memberId) return { error: 'no_member' };
  if (!invitePhone) return { error: 'no_phone' };
// Normalize phone: strip non-digits to match auth.users format
  const normalizedPhone = invitePhone.replace(/\D/g, '');
  if (!['view', 'edit', 'admin'].includes(permission)) {
    return { error: 'invalid_permission' };
  }

  // Generate a unique code (retry if collision — extremely unlikely)
  let code, attempt = 0;
  while (attempt < 5) {
    code = generateInviteCode();
    const { data: existing } = await supabase
      .from('share_invites')
      .select('id')
      .eq('token', code)
      .maybeSingle();
    if (!existing) break;
    attempt++;
  }
  if (attempt >= 5) return { error: 'code_generation_failed' };

  // Insert the invite
  const { data, error } = await supabase
    .from('share_invites')
    .insert({
      member_id:    memberId,
      shared_by:    userId,
      invite_phone: normalizedPhone,
      permission,
      token:        code,
      status:       'pending',
    })
    .select()
    .single();

  if (error) {
    console.warn('[sharing] createInvite failed:', error.message);
    return { error: error.message };
  }

  return { error: null, code, invite: data };
}

// ====================================================================
// Accept an invite by code
// ====================================================================

console.log('[sharing] acceptInvite token query:', { 
    input: code, 
    normalized, 
    length: normalized.length 
  });
if (!invite) {
    console.log('[sharing] acceptInvite: invite not found for token:', normalized);
    return { error: 'not_found' };
  }

export async function acceptInvite(code) {
  const userId = await getCurrentUserId();
  const userPhone = await getCurrentUserPhone();
  if (!userId) return { error: 'not_signed_in' };
  if (!code) return { error: 'no_code' };

  // Normalize code (strip whitespace, uppercase)
  const normalized = code.trim().toUpperCase();

  // Find invite by token
  const { data: invite, error: findErr } = await supabase
    .from('share_invites')
    .select('*')
    .eq('token', normalized)
    .eq('status', 'pending')
    .maybeSingle();

  if (findErr) {
    console.warn('[sharing] acceptInvite find failed:', findErr.message);
    return { error: 'find_failed' };
  }

  if (!invite) return { error: 'not_found' };

  // Check phone match (security: invite was for THIS phone)const normalize = (p) => (p || '').replace(/\D/g, '');
  if (invite.invite_phone && userPhone && normalize(invite.invite_phone) !== normalize(userPhone)) {
    return { error: 'phone_mismatch' };
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: 'expired' };
  }

  // Don't allow self-acceptance (owner accepting their own invite)
  if (invite.shared_by === userId) {
    return { error: 'self_invite' };
  }

  // Create member_shares row
  const { data: share, error: shareErr } = await supabase
    .from('member_shares')
    .insert({
      member_id:   invite.member_id,
      shared_by:   invite.shared_by,
      shared_with: userId,
      permission:  invite.permission,
      status:      'active',
      accepted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (shareErr) {
    console.warn('[sharing] acceptInvite create share failed:', shareErr.message);
    return { error: shareErr.message };
  }

  // Mark invite as accepted
  await supabase
    .from('share_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  return { error: null, share, memberId: invite.member_id };
}

// ====================================================================
// List invites I've created (for "Sharing" management screen)
// ====================================================================

export async function listMyInvites() {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in', invites: [] };

  const { data, error } = await supabase
    .from('share_invites')
    .select('*')
    .eq('shared_by', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[sharing] listMyInvites failed:', error.message);
    return { error: error.message, invites: [] };
  }

  return { error: null, invites: data || [] };
}

// ====================================================================
// List shares: members I own that I've shared with others
// ====================================================================

export async function listSharesIveGranted() {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in', shares: [] };

  const { data, error } = await supabase
    .from('member_shares')
    .select('*')
    .eq('shared_by', userId)
    .eq('status', 'active')
    .order('accepted_at', { ascending: false });

  if (error) {
    console.warn('[sharing] listSharesIveGranted failed:', error.message);
    return { error: error.message, shares: [] };
  }

  return { error: null, shares: data || [] };
}

// ====================================================================
// List shares: members others have shared WITH me
// ====================================================================

export async function listSharesWithMe() {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in', shares: [] };

  const { data, error } = await supabase
    .from('member_shares')
    .select('*, family_members(*)')
    .eq('shared_with', userId)
    .eq('status', 'active')
    .order('accepted_at', { ascending: false });

  if (error) {
    console.warn('[sharing] listSharesWithMe failed:', error.message);
    return { error: error.message, shares: [] };
  }

  return { error: null, shares: data || [] };
}

// ====================================================================
// Revoke a share (owner can revoke shares they granted)
// ====================================================================

export async function revokeShare(shareId) {
  const userId = await getCurrentUserId();
  if (!userId) return { error: 'not_signed_in' };
  if (!shareId) return { error: 'no_share_id' };

  const { error } = await supabase
    .from('member_shares')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('shared_by', userId);  // safety: only revoke shares I created

  if (error) {
    console.warn('[sharing] revokeShare failed:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ====================================================================
// Check permission level for a member
//   Returns: 'owner' | 'admin' | 'edit' | 'view' | null
// ====================================================================

export async function getMyPermissionForMember(memberId) {
  const userId = await getCurrentUserId();
  if (!userId || !memberId) return null;

  // Check if I own the member
  const { data: member } = await supabase
    .from('family_members')
    .select('owner_user_id')
    .eq('id', memberId)
    .maybeSingle();

  if (member?.owner_user_id === userId) return 'owner';

  // Check if I have an active share
  const { data: share } = await supabase
    .from('member_shares')
    .select('permission')
    .eq('member_id', memberId)
    .eq('shared_with', userId)
    .eq('status', 'active')
    .maybeSingle();

  return share?.permission || null;
}

// ====================================================================
// Helper: build WhatsApp share message
// ====================================================================

export function buildWhatsAppShareMessage(code, memberName) {
  return (
    `Hi! I've shared ${memberName ? memberName + "'s" : 'my'} health records with you on MedRecord.\n\n` +
    `📲 Invite code: ${code}\n\n` +
    `Open the MedRecord app, login, then tap "Have an invite code?" and enter the code above.\n\n` +
    `(Note: app is currently in beta. If you don't have it yet, please contact me for access.)`
  );
}
