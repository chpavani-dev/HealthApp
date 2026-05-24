// ====================================================================
// SupabaseLoginScreen — phone input with country picker
// ====================================================================
//
// Auto-detects user's country from device locale, allows override
// via country picker (flag dropdown). On valid phone + "Send OTP",
// calls AuthContext.signInWithPhone(phoneE164).
//
// Props:
//   onCodeSent(phoneE164)  — called when OTP successfully sent.
//                            Parent (App.js) advances to OTPScreen.
// ====================================================================

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, SafeAreaView,
} from 'react-native';
import PhoneInput from 'react-native-phone-number-input';
import { useAuth } from '../AuthContext';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const BG      = '#F5F7FA';
const RED     = '#DC2626';
const RED_LT  = '#FEE2E2';

export default function SupabaseLoginScreen({ onCodeSent }) {
  const { signInWithPhone } = useAuth();

  const phoneInputRef = useRef(null);
  const [phoneNumber, setPhoneNumber]         = useState('');
  const [formattedNumber, setFormattedNumber] = useState('');
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');

  async function handleSendOTP() {
    setError('');

    const isValid = phoneInputRef.current?.isValidNumber(phoneNumber);
    if (!isValid) {
      setError('Please enter a valid phone number');
      return;
    }
    if (!formattedNumber) {
      setError('Phone number could not be formatted');
      return;
    }

    setLoading(true);
    const { error: authErr } = await signInWithPhone(formattedNumber);
    setLoading(false);

    if (authErr) {
      const msg = authErr.message || String(authErr);
      if (msg.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (msg.toLowerCase().includes('invalid phone')) {
        setError('That phone number isn\'t valid. Check the country code and number.');
      } else if (msg.toLowerCase().includes('network')) {
        setError('Network error. Check your internet connection.');
      } else {
        setError(msg);
      }
      return;
    }

    // Success — tell parent to show OTPScreen
    if (typeof onCodeSent === 'function') {
      onCodeSent(formattedNumber);
    }
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
          <View style={styles.logoBox}>
            <Text style={styles.logoEmoji}>🏥</Text>
            <Text style={styles.logoTitle}>MedRecord</Text>
            <Text style={styles.logoSubtitle}>Family health records, made simple</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.heading}>Welcome</Text>
            <Text style={styles.subtitle}>
              Enter your phone number to sign in or create an account
            </Text>

            <Text style={styles.fieldLabel}>Phone number</Text>
            <PhoneInput
              ref={phoneInputRef}
              defaultValue={phoneNumber}
              defaultCode="IN"
              layout="first"
              onChangeText={setPhoneNumber}
              onChangeFormattedText={setFormattedNumber}
              autoFocus={false}
              containerStyle={styles.phoneContainer}
              textContainerStyle={styles.phoneTextContainer}
              textInputStyle={styles.phoneTextInput}
              codeTextStyle={styles.phoneCodeText}
              flagButtonStyle={styles.phoneFlagButton}
              countryPickerProps={{ withAlphaFilter: true, withCallingCode: true }}
              disabled={loading}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleSendOTP}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Send verification code</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.helperText}>
              We'll send a 6-digit code by SMS. Standard message rates may apply.
            </Text>
          </View>

          <Text style={styles.footerText}>
            By continuing, you agree to MedRecord's Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: BG },
  scroll:         { flexGrow: 1, padding: 24, paddingTop: 60 },

  logoBox:        { alignItems: 'center', marginBottom: 32 },
  logoEmoji:      { fontSize: 56, marginBottom: 8 },
  logoTitle:      { fontSize: 28, fontWeight: '800', color: DARK, letterSpacing: -0.5 },
  logoSubtitle:   { fontSize: 14, color: GRAY, marginTop: 4 },

  formCard:       { backgroundColor: '#FFF', borderRadius: 16, padding: 22,
                    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05, shadowRadius: 8 },
  heading:        { fontSize: 22, fontWeight: '700', color: DARK },
  subtitle:       { fontSize: 14, color: GRAY, marginTop: 6, marginBottom: 24, lineHeight: 20 },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 8 },

  phoneContainer:     { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5,
                        borderColor: '#E5E7EB', width: '100%', height: 56 },
  phoneTextContainer: { backgroundColor: 'transparent', borderRadius: 12, paddingVertical: 0 },
  phoneTextInput:     { fontSize: 16, color: DARK, height: 56 },
  phoneCodeText:      { fontSize: 16, color: DARK, fontWeight: '600' },
  phoneFlagButton:    { width: 76 },

  errorBox:       { backgroundColor: RED_LT, borderRadius: 10, padding: 12, marginTop: 16,
                    borderLeftWidth: 4, borderLeftColor: RED },
  errorText:      { color: RED, fontSize: 13, fontWeight: '500' },

  primaryBtn:     { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 16,
                    alignItems: 'center', marginTop: 20 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  helperText:     { fontSize: 11, color: GRAY, textAlign: 'center', marginTop: 14, lineHeight: 16 },

  footerText:     { fontSize: 11, color: GRAY, textAlign: 'center', marginTop: 24,
                    paddingHorizontal: 20, lineHeight: 16 },
});
