// ====================================================================
// SupabaseLoginScreen — phone input with custom country picker
// ====================================================================
// v5: SafeAreaView from react-native-safe-area-context with edges prop.
// ====================================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CountryPicker, { getCountryByCode } from './CountryPicker';
import { useAuth } from '../AuthContext';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const BG      = '#F5F7FA';
const RED     = '#DC2626';
const RED_LT  = '#FEE2E2';

const EXPECTED_LENGTHS = {
  IN: [10, 10],    US: [10, 10],    GB: [10, 11],
  CA: [10, 10],    AU: [9, 9],      AE: [9, 9],
  SG: [8, 8],      SA: [9, 9],      MY: [9, 10],
  NZ: [8, 10],     DE: [10, 11],    FR: [9, 9],
  IT: [9, 11],     ES: [9, 9],      NL: [9, 9],
  CH: [9, 9],      SE: [7, 10],     NO: [8, 8],
  DK: [8, 8],      FI: [9, 11],     IE: [9, 9],
  BE: [9, 9],      AT: [10, 13],    PT: [9, 9],
  PL: [9, 9],      CZ: [9, 9],      GR: [10, 10],
  IL: [9, 9],      TR: [10, 10],    EG: [10, 10],
  ZA: [9, 9],      NG: [10, 10],    KE: [9, 9],
  JP: [10, 11],    KR: [9, 10],     CN: [11, 11],
  HK: [8, 8],      TW: [9, 9],      TH: [9, 9],
  VN: [9, 10],     PH: [10, 10],    ID: [9, 12],
  PK: [10, 10],    BD: [10, 10],    LK: [9, 9],
  NP: [10, 10],    BR: [10, 11],    MX: [10, 10],
  AR: [10, 10],    CL: [9, 9],      CO: [10, 10],
  RU: [10, 10],    UA: [9, 9],      QA: [8, 8],
  KW: [8, 8],      BH: [8, 8],      OM: [8, 8],
  JO: [9, 9],      LB: [7, 8],      MA: [9, 9],
};

function validatePhone(countryCode, localDigits) {
  if (!localDigits || localDigits.length < 4) return false;
  const range = EXPECTED_LENGTHS[countryCode] || [7, 15];
  return localDigits.length >= range[0] && localDigits.length <= range[1];
}

function getDefaultCountry() {
  return getCountryByCode('IN');
}

export default function SupabaseLoginScreen({ onCodeSent }) {
  const { signInWithPhone } = useAuth();

  const [country, setCountry]       = useState(() => getDefaultCountry());
  const [phoneLocal, setPhoneLocal] = useState('');
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
    if (!validatePhone(country.code, cleaned)) {
      const range = EXPECTED_LENGTHS[country.code] || [7, 15];
      const expectedDesc = range[0] === range[1]
        ? `${range[0]} digits`
        : `${range[0]}\u2013${range[1]} digits`;
      setError(`Please enter a valid ${country.name} phone number (${expectedDesc}).`);
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
        setError('Phone number was rejected. Please check the country code and number.');
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
         <Image
              source={require('../assets/branding/horizontal/vitalynx-logo-horizontal-400.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoSubtitle}>Family health records, made simple</Text>

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
            By continuing, you agree to Vitalynx's Terms of Service and Privacy Policy.
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
  scroll:         { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 40 },

  logoBox:        { alignItems: 'center', marginBottom: 32 },
 logoImage:      { width: 260, height: 80, marginBottom: 8 },
  logoSubtitle:   { fontSize: 14, color: GRAY, marginTop: 4 },

  formCard:       { backgroundColor: '#FFF', borderRadius: 16, padding: 22,
                    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05, shadowRadius: 8 },
  heading:        { fontSize: 22, fontWeight: '700', color: DARK },
  subtitle:       { fontSize: 14, color: GRAY, marginTop: 6, marginBottom: 24, lineHeight: 20 },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: DARK, marginBottom: 8 },

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
