// ====================================================================
// SupabaseLoginScreen — phone input with custom country picker
// ====================================================================
//
// Uses our own CountryPicker (~60 countries) and libphonenumber-js
// for validation. Pure JS, no React 19 incompatibilities.
//
// Props:
//   onCodeSent(phoneE164)  — called when OTP successfully sent.
//                            Parent (App.js) advances to OTPScreen.
// ====================================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView,
} from 'react-native';
import { Localization } from 'expo-localization';
import { isValidPhoneNumber } from 'libphonenumber-js/mobile';
import CountryPicker, { COUNTRIES, getCountryByCode } from './CountryPicker';
import { useAuth } from '../AuthContext';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const BG      = '#F5F7FA';
const RED     = '#DC2626';
const RED_LT  = '#FEE2E2';

// Try to detect device's country, fall back to India
function detectDefaultCountry() {
  try {
    // expo-localization may not be available — gracefully fall back
    const region =
      Localization?.region ||
      Localization?.getLocales?.()[0]?.regionCode ||
      'IN';
    return getCountryByCode(region.toUpperCase());
  } catch (e) {
    return getCountryByCode('IN');
  }
}

export default function SupabaseLoginScreen({ onCodeSent }) {
  const { signInWithPhone } = useAuth();

  const [country, setCountry]       = useState(() => detectDefaultCountry());
  const [phoneLocal, setPhoneLocal] = useState('');       // local part user types
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const formattedNumber = country.dial + phoneLocal.replace(/[^0-9]/g, '');

  async function handleSendOTP() {
    setError('');

    const cleaned = phoneLocal.replace(/[^0-9]/g, '');
    if (!cleaned) {
      setError('Please enter your phone number');
      return;
    }

    if (!isValidPhoneNumber(formattedNumber)) {
      setError('That phone number doesn\'t look valid. Please check it.');
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
        setError('Phone number rejected by the server. Check the country code and number.');
      } else if (msg.toLowerCase().includes('network')) {
        setError('Network error. Check your internet connection.');
      } else {
        setError(msg);
      }
      return;
    }

    if (typeof onCodeSent === 'function') {
      onCodeSent(formattedNumber);
    }
  }

  function handleSelectCountry(c) {
    setCountry(c);
    setError('');
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

            <View style={styles.phoneRow}>
              <TouchableOpacity
                style={styles.countryBox}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={styles.flagText}>{country.flag}</Text>
                <Text style={styles.dialText}>{country.dial}</Text>
                <Text style={styles.chevron}>▾</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.phoneInput}
                value={phoneLocal}
                onChangeText={(v) => {
                  setPhoneLocal(v.replace(/[^0-9]/g, ''));
                  setError('');
                }}
                placeholder="Phone number"
                placeholderTextColor={GRAY}
                keyboardType="phone-pad"
                editable={!loading}
                maxLength={15}
              />
            </View>

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

      <CountryPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectCountry}
      />
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

  // Phone row: country box + phone input
  phoneRow:       { flexDirection: 'row', gap: 10 },
  countryBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
                    borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
                    paddingHorizontal: 12, height: 56, gap: 6 },
  flagText:       { fontSize: 22 },
  dialText:       { fontSize: 15, color: DARK, fontWeight: '600' },
  chevron:        { fontSize: 10, color: GRAY, marginLeft: 2 },
  phoneInput:     { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5,
                    borderColor: '#E5E7EB', paddingHorizontal: 14, height: 56,
                    fontSize: 16, color: DARK },

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
