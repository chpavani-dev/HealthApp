// ====================================================================
// OTPScreen — 6-digit code verification
// ====================================================================
//
// Props:
//   phone            (E.164 format, e.g. '+919876543210')
//   onChangeNumber() — called when user taps "Change number".
//                      Parent (App.js) reverts to login screen.
//
// Auto-submits when 6 digits are entered.
// Calls AuthContext.verifyOtp(phone, code) on Verify button.
// Shows "Resend code" with 60s cooldown and 5min code expiry timer.
//
// On success: AuthContext.session updates automatically, App.js's
// auth gate detects new session and routes to main app.
// ====================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView,
} from 'react-native';
import { useAuth } from '../AuthContext';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const BG      = '#F5F7FA';
const RED     = '#DC2626';
const RED_LT  = '#FEE2E2';

const CODE_LENGTH    = 6;
const RESEND_COOLDOWN = 60;
const CODE_EXPIRY    = 300;

export default function OTPScreen({ phone, onChangeNumber }) {
  const { verifyOtp, signInWithPhone } = useAuth();

  const [code, setCode]               = useState(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [resendCooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [codeExpiry, setCodeExpiry]   = useState(CODE_EXPIRY);
  const [resending, setResending]     = useState(false);

  const inputsRef = useRef([]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Code expiry
  useEffect(() => {
    if (codeExpiry <= 0) return;
    const t = setInterval(() => setCodeExpiry(e => e - 1), 1000);
    return () => clearInterval(t);
  }, [codeExpiry]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    const full = code.join('');
    if (full.length === CODE_LENGTH && !loading) {
      handleVerify(full);
    }
  }, [code]);

  function updateDigit(index, value) {
    const cleaned = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...code];
    next[index] = cleaned;
    setCode(next);
    setError('');

    if (cleaned && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(index, e) {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  async function handleVerify(fullCode) {
    setError('');

    if (!fullCode || fullCode.length !== CODE_LENGTH) {
      setError(`Please enter the ${CODE_LENGTH}-digit code`);
      return;
    }

    if (codeExpiry <= 0) {
      setError('Code expired. Please request a new one.');
      return;
    }

    setLoading(true);
    const { error: authErr } = await verifyOtp(phone, fullCode);
    setLoading(false);

    if (authErr) {
      const msg = authErr.message || String(authErr);
      if (msg.toLowerCase().includes('token has expired') ||
          msg.toLowerCase().includes('invalid token')) {
        setError('Invalid or expired code. Please try again or request a new code.');
      } else if (msg.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please wait a minute.');
      } else {
        setError(msg);
      }
      setCode(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
      return;
    }

    // SUCCESS — AuthContext picks up new session automatically.
    // App.js's auth gate will route to MainApp.
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setError('');
    const { error: authErr } = await signInWithPhone(phone);
    setResending(false);

    if (authErr) {
      setError(authErr.message || 'Could not resend code');
      return;
    }

    setCooldown(RESEND_COOLDOWN);
    setCodeExpiry(CODE_EXPIRY);
    setCode(Array(CODE_LENGTH).fill(''));
    inputsRef.current[0]?.focus();
  }

  function handleChangeNumber() {
    if (typeof onChangeNumber === 'function') {
      onChangeNumber();
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>📱</Text>
            <Text style={styles.heading}>Verify your number</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.phoneText}>{phone}</Text>
            </Text>
            <TouchableOpacity onPress={handleChangeNumber}>
              <Text style={styles.changeLink}>Change number</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Enter 6-digit code</Text>

            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={el => inputsRef.current[i] = el}
                  style={[
                    styles.codeBox,
                    digit && styles.codeBoxFilled,
                    error && styles.codeBoxError,
                  ]}
                  value={digit}
                  onChangeText={v => updateDigit(i, v)}
                  onKeyPress={e => handleKeyPress(i, e)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={i === 0}
                  editable={!loading}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                />
              ))}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={() => handleVerify(code.join(''))}
              disabled={loading || code.join('').length !== CODE_LENGTH}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {resendCooldown > 0 ? (
                <Text style={styles.resendCooldown}>
                  Resend code in {resendCooldown}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resending}>
                  <Text style={styles.resendLink}>
                    {resending ? 'Sending...' : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {codeExpiry > 0 && codeExpiry < CODE_EXPIRY && (
              <Text style={styles.expiryText}>
                Code expires in {formatTime(codeExpiry)}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: BG },
  scroll:         { flexGrow: 1, padding: 24, paddingTop: 60 },

  header:         { alignItems: 'center', marginBottom: 32 },
  headerEmoji:    { fontSize: 48, marginBottom: 8 },
  heading:        { fontSize: 24, fontWeight: '800', color: DARK },
  subtitle:       { fontSize: 14, color: GRAY, marginTop: 12, textAlign: 'center', lineHeight: 22 },
  phoneText:      { color: DARK, fontWeight: '700' },
  changeLink:     { color: TEAL, fontSize: 14, fontWeight: '600', marginTop: 14 },

  formCard:       { backgroundColor: '#FFF', borderRadius: 16, padding: 22,
                    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05, shadowRadius: 8 },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 12,
                    textAlign: 'center' },

  codeRow:        { flexDirection: 'row', justifyContent: 'space-between',
                    marginBottom: 8 },
  codeBox:        { width: 46, height: 56, borderRadius: 10, borderWidth: 1.5,
                    borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
                    fontSize: 22, fontWeight: '700', color: DARK,
                    textAlign: 'center' },
  codeBoxFilled:  { borderColor: TEAL, backgroundColor: TEAL_LT },
  codeBoxError:   { borderColor: RED, backgroundColor: RED_LT },

  errorBox:       { backgroundColor: RED_LT, borderRadius: 10, padding: 12, marginTop: 16,
                    borderLeftWidth: 4, borderLeftColor: RED },
  errorText:      { color: RED, fontSize: 13, fontWeight: '500' },

  primaryBtn:     { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 16,
                    alignItems: 'center', marginTop: 22 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  resendRow:      { marginTop: 20, alignItems: 'center' },
  resendLink:     { color: TEAL, fontSize: 14, fontWeight: '600' },
  resendCooldown: { color: GRAY, fontSize: 13 },
  expiryText:     { color: GRAY, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
