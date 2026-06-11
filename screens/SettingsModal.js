// screens/SettingsModal.js
// Settings + Delete Account flow (with OTP confirmation via Supabase signInWithOtp)

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useAuth } from '../AuthContext';

const TEAL = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const RED = '#DC2626';
const RED_LT = '#FEE2E2';
const RED_DK = '#991B1B';
const GRAY = '#6B7280';
const DARK = '#111827';
const LIGHT_GRAY = '#F9FAFB';

// Replace with your actual Supabase project URL
const SUPABASE_URL = 'https://nlnivxadkfadcmjckeok.supabase.co';

export default function SettingsModal({ visible, onClose, onAccountDeleted, memberCount = 0 }) {
  const [stage, setStage] = useState('main');  // 'main' | 'warning' | 'otp' | 'deleting'
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

 const { session } = useAuth();
  const userPhone = session?.user?.phone ? `+${session.user.phone}` : null;

  function handleClose() {
    setStage('main');
    setOtpCode('');
    setSendingOtp(false);
    setVerifyingOtp(false);
    onClose();
  }

  function openExternal(url) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open', `Please visit:\n${url}`);
    });
  }

  // Step 1: User taps Delete Account → show warning
  function handleDeletePressed() {
    setStage('warning');
  }

  // Step 2: User confirms warning → send OTP
  async function handleSendOtp() {
    if (!userPhone) {
      Alert.alert('Error', 'Phone number not available. Please re-login and try again.');
      return;
    }
    setSendingOtp(true);
    const phoneFormatted = userPhone.startsWith('+') ? userPhone : `+${userPhone}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: phoneFormatted });
    setSendingOtp(false);

    if (error) {
      Alert.alert('Could not send code', error.message || 'Please try again later.');
      return;
    }
    setStage('otp');
  }

  // Step 3: Verify OTP and call Edge Function
  async function handleConfirmDelete() {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Code required', 'Please enter the 6-digit code from your SMS.');
      return;
    }

    setVerifyingOtp(true);
    const phoneFormatted = userPhone.startsWith('+') ? userPhone : `+${userPhone}`;

    // Verify OTP — this creates a fresh session
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      phone: phoneFormatted,
      token: otpCode,
      type: 'sms',
    });

    if (verifyError) {
      setVerifyingOtp(false);
      Alert.alert('Invalid code', verifyError.message || 'The code is wrong or expired.');
      return;
    }

    // Get fresh session token
    const accessToken = verifyData?.session?.access_token;
    if (!accessToken) {
      setVerifyingOtp(false);
      Alert.alert('Verification failed', 'Could not obtain session. Please try again.');
      return;
    }

    setStage('deleting');

    // Call Edge Function with fresh JWT
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setVerifyingOtp(false);
        setStage('warning');
        Alert.alert(
          'Deletion failed',
          result.error || result.detail || 'Could not delete account. Please try again or contact support.'
        );
        return;
      }

      // Success — wipe local + sign out
      await AsyncStorage.multiRemove(['user', 'members', 'activeMember']);
      await supabase.auth.signOut().catch(() => {});

      // Notify parent — sets user to null, returns to login
      onAccountDeleted();

    } catch (err) {
      setVerifyingOtp(false);
      setStage('warning');
      Alert.alert('Network error', 'Could not contact server. Please check your connection.');
    }
  }

  // ── MAIN settings view ──
  if (stage === 'main') {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <View style={st.handle} />
            <View style={st.header}>
              <Text style={st.title}>Settings</Text>
              <TouchableOpacity style={st.closeBtn} onPress={handleClose}>
                <Text style={st.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.sectionLabel}>ABOUT</Text>
              <View style={st.card}>
                <View style={st.rowSimple}>
                  <Text style={st.rowLabel}>Version</Text>
                  <Text style={st.rowValue}>1.0.0</Text>
                </View>
                <View style={st.divider} />
                <View style={st.rowSimple}>
                  <Text style={st.rowLabel}>Made by</Text>
                  <Text style={st.rowValue}>Accusaga Informatics</Text>
                </View>
              </View>

              <Text style={st.sectionLabel}>LEGAL</Text>
              <View style={st.card}>
                <TouchableOpacity
                  style={st.rowLink}
                  onPress={() => openExternal('https://accusaga.in/privacy')}
                  activeOpacity={0.7}
                >
                  <Text style={st.rowLabel}>Privacy Policy</Text>
                  <Text style={st.rowArrow}>›</Text>
                </TouchableOpacity>
                <View style={st.divider} />
                <TouchableOpacity
                  style={st.rowLink}
                  onPress={() => openExternal('https://accusaga.in/terms')}
                  activeOpacity={0.7}
                >
                  <Text style={st.rowLabel}>Terms of Service</Text>
                  <Text style={st.rowArrow}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={st.sectionLabel}>SUPPORT</Text>
              <View style={st.card}>
                <TouchableOpacity
                  style={st.rowLink}
                  onPress={() => openExternal('mailto:chpavani@gmail.com')}
                  activeOpacity={0.7}
                >
                  <Text style={st.rowLabel}>Contact support</Text>
                  <Text style={st.rowArrow}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={[st.sectionLabel, { color: RED_DK }]}>DANGER ZONE</Text>
              <View style={[st.card, { borderColor: '#FECACA', borderWidth: 1 }]}>
                <TouchableOpacity
                  style={st.deleteBtn}
                  onPress={handleDeletePressed}
                  activeOpacity={0.7}
                >
                  <Text style={st.deleteBtnText}>🗑️  Delete Account</Text>
                </TouchableOpacity>
                <Text style={st.dangerHint}>
                  Permanently delete your account and all data. This cannot be undone.
                </Text>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ── WARNING stage ──
  if (stage === 'warning') {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
        <View style={st.overlay}>
          <View style={st.warningSheet}>
            <Text style={st.warningEmoji}>⚠️</Text>
            <Text style={st.warningTitle}>Delete Account?</Text>
            <Text style={st.warningSub}>This will permanently delete:</Text>

            <View style={st.warningList}>
              <Text style={st.warningItem}>• {memberCount} family member{memberCount !== 1 ? 's' : ''}</Text>
              <Text style={st.warningItem}>• All lab reports & prescriptions</Text>
              <Text style={st.warningItem}>• All notes & voice recordings</Text>
              <Text style={st.warningItem}>• All sharing access</Text>
              <Text style={st.warningItem}>• Your account login</Text>
            </View>

            <Text style={st.warningWarn}>This cannot be undone.</Text>

            <Text style={st.warningOtpInfo}>
              We'll send a 6-digit code to {userPhone || 'your phone'} to confirm.
            </Text>

            <View style={st.warningButtons}>
              <TouchableOpacity
                style={st.warningCancel}
                onPress={() => setStage('main')}
                activeOpacity={0.7}
              >
                <Text style={st.warningCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.warningConfirm, sendingOtp && { opacity: 0.6 }]}
                onPress={handleSendOtp}
                disabled={sendingOtp}
                activeOpacity={0.8}
              >
                {sendingOtp ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={st.warningConfirmText}>Send Code</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ── OTP stage ──
  if (stage === 'otp') {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
        <View style={st.overlay}>
          <View style={st.warningSheet}>
            <Text style={st.warningEmoji}>🔐</Text>
            <Text style={st.warningTitle}>Confirm Deletion</Text>
            <Text style={st.warningSub}>Enter the 6-digit code sent to{'\n'}{userPhone}</Text>

            <TextInput
              style={st.otpInput}
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#D1D5DB"
              autoFocus
              textAlign="center"
            />

            <Text style={st.warningWarn}>
              This is your last chance to cancel.
            </Text>

            <View style={st.warningButtons}>
              <TouchableOpacity
                style={st.warningCancel}
                onPress={() => { setStage('warning'); setOtpCode(''); }}
                disabled={verifyingOtp}
                activeOpacity={0.7}
              >
                <Text style={st.warningCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.warningConfirm, { backgroundColor: RED }, verifyingOtp && { opacity: 0.6 }]}
                onPress={handleConfirmDelete}
                disabled={verifyingOtp}
                activeOpacity={0.8}
              >
                {verifyingOtp ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={st.warningConfirmText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ── DELETING stage ──
  if (stage === 'deleting') {
    return (
      <Modal visible={visible} animationType="fade" transparent>
        <View style={st.overlay}>
          <View style={st.warningSheet}>
            <ActivityIndicator size="large" color={RED} />
            <Text style={[st.warningTitle, { marginTop: 20 }]}>Deleting account...</Text>
            <Text style={st.warningSub}>Please wait. This takes a few seconds.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return null;
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, maxHeight: '90%' },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: DARK },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: GRAY, fontWeight: '700' },

  sectionLabel: { fontSize: 11, color: GRAY, marginTop: 8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  card: { backgroundColor: LIGHT_GRAY, borderRadius: 12, padding: 0, marginBottom: 18, overflow: 'hidden' },
  rowSimple: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  rowLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  rowLabel: { fontSize: 14, color: DARK, fontWeight: '500' },
  rowValue: { fontSize: 14, color: GRAY },
  rowArrow: { fontSize: 22, color: '#D1D5DB', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 14 },

  deleteBtn: { paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center' },
  deleteBtnText: { fontSize: 15, color: RED, fontWeight: '700' },
  dangerHint: { fontSize: 11, color: GRAY, paddingHorizontal: 14, paddingBottom: 14, textAlign: 'center' },

  // Warning + OTP modals
  warningSheet: { backgroundColor: '#FFFFFF', margin: 24, borderRadius: 20, padding: 24, alignItems: 'center' },
  warningEmoji: { fontSize: 44, marginBottom: 12 },
  warningTitle: { fontSize: 22, fontWeight: '800', color: DARK, marginBottom: 8 },
  warningSub: { fontSize: 14, color: GRAY, textAlign: 'center', marginBottom: 14, lineHeight: 20 },
  warningList: { alignSelf: 'stretch', backgroundColor: RED_LT, borderRadius: 10, padding: 12, marginBottom: 16 },
  warningItem: { fontSize: 13, color: RED_DK, marginVertical: 2 },
  warningWarn: { fontSize: 13, color: RED_DK, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  warningOtpInfo: { fontSize: 12, color: GRAY, fontStyle: 'italic', marginBottom: 16, textAlign: 'center' },
  warningButtons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 4 },
  warningCancel: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center' },
  warningCancelText: { fontSize: 14, color: GRAY, fontWeight: '600' },
  warningConfirm: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: RED, alignItems: 'center' },
  warningConfirmText: { fontSize: 14, color: '#FFF', fontWeight: '700' },

  otpInput: { borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12, paddingVertical: 14, fontSize: 28, fontWeight: '700', color: DARK, letterSpacing: 8, marginBottom: 16, alignSelf: 'stretch', backgroundColor: LIGHT_GRAY },
});