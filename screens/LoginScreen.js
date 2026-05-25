import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Modal, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TEAL  = '#0B8FAC';
const DARK  = '#111827';
const GRAY  = '#6B7280';
const BG    = '#F5F7FA';

const COUNTRIES = [
  { name: 'India',         flag: '🇮🇳', code: '+91', digits: 10 },
  { name: 'United States', flag: '🇺🇸', code: '+1',  digits: 10 },
];

export default function LoginScreen({ onLogin }) {
  const [step, setStep]             = useState(1);
  const [phone, setPhone]           = useState('');
  const [otp, setOtp]               = useState('');
  const [loading, setLoading]       = useState(false);
  const [country, setCountry]       = useState(COUNTRIES[0]);
  const [showPicker, setShowPicker] = useState(false);

  function handleSendOTP() {
    if (phone.length < country.digits) {
      Alert.alert('Invalid number', `Please enter a valid ${country.digits}-digit mobile number.`);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(2);
      Alert.alert('OTP Sent', `A 6-digit OTP has been sent to ${country.code} ${phone}`);
    }, 1500);
  }

  function handleVerifyOTP() {
    if (otp.length < 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin({ phone: country.code + phone, country: country.name });
    }, 1500);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.container}>

          {/* Logo */}
          <View style={s.logoWrap}>
            <View style={s.logoCircle}>
              <Text style={s.logoEmoji}>🏥</Text>
            </View>
            <Text style={s.appName}>MedRecord</Text>
            <Text style={s.appTagline}>Your health, organised</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            {step === 1 ? (
              <>
                <Text style={s.cardTitle}>Enter your mobile number</Text>
                <Text style={s.cardSubtitle}>We'll send you a 6-digit OTP to verify your identity</Text>

                {/* Country selector */}
                <Text style={s.fieldLabel}>Country</Text>
                <TouchableOpacity style={s.countrySelector} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
                  <Text style={s.countrySelectorText}>{country.flag}  {country.name}  ({country.code})</Text>
                  <Text style={s.dropIcon}>▾</Text>
                </TouchableOpacity>

                {/* Phone input */}
                <Text style={s.fieldLabel}>Mobile Number</Text>
                <View style={s.phoneRow}>
                  <View style={s.countryCode}>
                    <Text style={s.countryCodeText}>{country.flag} {country.code}</Text>
                  </View>
                  <TextInput
                    style={s.phoneInput}
                    placeholder={`${country.digits}-digit number`}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    maxLength={country.digits}
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <TouchableOpacity
                  style={[s.btn, phone.length < country.digits && s.btnDisabled]}
                  onPress={handleSendOTP}
                  disabled={loading || phone.length < country.digits}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={s.btnText}>Send OTP →</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.cardTitle}>Enter OTP</Text>
                <Text style={s.cardSubtitle}>
                  We sent a 6-digit code to{'\n'}{country.code} {phone}
                </Text>

                <TextInput
                  style={s.otpInput}
                  placeholder="• • • • • •"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  textAlign="center"
                />

                <TouchableOpacity
                  style={[s.btn, otp.length < 6 && s.btnDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={loading || otp.length < 6}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={s.btnText}>Verify & Login →</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={s.resendBtn} onPress={() => { setStep(1); setOtp(''); }}>
                  <Text style={s.resendText}>← Change number</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.resendBtn}
                  onPress={() => Alert.alert('OTP Resent', 'A new OTP has been sent.')}
                >
                  <Text style={s.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Privacy */}
          <Text style={s.privacy}>
            🔒 Your data is encrypted and stored securely{'\n'}
            in compliance with DPDP Act 2023 & US HIPAA standards
          </Text>

        </View>
      </KeyboardAvoidingView>

      {/* Country picker modal */}
      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHandle} />
            <Text style={s.pickerTitle}>Select Country</Text>
            <ScrollView>
              {COUNTRIES.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.countryRow, country.code === c.code && s.countryRowActive]}
                  onPress={() => { setCountry(c); setPhone(''); setShowPicker(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.countryFlag}>{c.flag}</Text>
                  <View style={s.countryInfo}>
                    <Text style={s.countryName}>{c.name}</Text>
                    <Text style={s.countryCode2}>{c.code}  ·  {c.digits} digits</Text>
                  </View>
                  {country.code === c.code && (
                    <Text style={s.countryCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: BG },
  flex:              { flex: 1 },
  container:         { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },

  logoWrap:          { alignItems: 'center', marginBottom: 32 },
  logoCircle:        { width: 80, height: 80, borderRadius: 24, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 14, elevation: 4, shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  logoEmoji:         { fontSize: 36 },
  appName:           { fontSize: 28, fontWeight: '800', color: TEAL },
  appTagline:        { fontSize: 14, color: GRAY, marginTop: 4 },

  card:              { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, marginBottom: 24 },
  cardTitle:         { fontSize: 20, fontWeight: '800', color: DARK, marginBottom: 6 },
  cardSubtitle:      { fontSize: 14, color: GRAY, marginBottom: 20, lineHeight: 20 },

  fieldLabel:        { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 8 },

  countrySelector:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#FAFAFA', marginBottom: 16 },
  countrySelectorText: { fontSize: 15, color: DARK, fontWeight: '500' },
  dropIcon:          { fontSize: 14, color: GRAY },

  phoneRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  countryCode:       { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: '#E5E7EB' },
  countryCodeText:   { fontSize: 14, fontWeight: '600', color: DARK },
  phoneInput:        { flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: DARK, backgroundColor: '#FAFAFA' },

  otpInput:          { borderWidth: 1.5, borderColor: TEAL, borderRadius: 12, paddingVertical: 16, fontSize: 28, fontWeight: '800', color: DARK, backgroundColor: '#F8FFFE', marginBottom: 20, letterSpacing: 8 },

  btn:               { backgroundColor: TEAL, borderRadius: 14, paddingVertical: 16, alignItems: 'center', elevation: 3, shadowColor: TEAL, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
  btnDisabled:       { backgroundColor: '#9CA3AF', elevation: 0, shadowOpacity: 0 },
  btnText:           { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  resendBtn:         { alignItems: 'center', paddingVertical: 12 },
  resendText:        { fontSize: 14, color: TEAL, fontWeight: '600' },

  privacy:           { textAlign: 'center', fontSize: 12, color: GRAY, lineHeight: 18 },

  pickerOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet:       { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  pickerHandle:      { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  pickerTitle:       { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 16 },

  countryRow:        { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, marginBottom: 8, backgroundColor: '#F9FAFB', gap: 14 },
  countryRowActive:  { backgroundColor: '#E8F7FA', borderWidth: 1.5, borderColor: TEAL },
  countryFlag:       { fontSize: 28 },
  countryInfo:       { flex: 1 },
  countryName:       { fontSize: 15, fontWeight: '700', color: DARK },
  countryCode2:      { fontSize: 13, color: GRAY, marginTop: 2 },
  countryCheck:      { fontSize: 18, color: TEAL, fontWeight: '700' },
});