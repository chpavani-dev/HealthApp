// ====================================================================
// CountryPicker — searchable modal for selecting country code
// ====================================================================
//
// Props:
//   visible       (boolean)            — show/hide the modal
//   onClose()                          — called when user dismisses
//   onSelect(country)                  — called with selected country object
//                                        { code, name, dial, flag }
//
// Uses a comprehensive list of ~60 countries covering India, US, UK,
// Canada, Australia, EU, Middle East, SE Asia — the markets most
// relevant to an Indian-family-focused app. Pure JS, no native deps.
// ====================================================================

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList,
  TextInput, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const DARK    = '#111827';
const GRAY    = '#6B7280';
const BG      = '#F5F7FA';

// Country list — code (ISO 3166-1 alpha-2), name, dial code, flag emoji
export const COUNTRIES = [
  { code: 'IN', name: 'India',         dial: '+91',  flag: '🇮🇳' },
  { code: 'US', name: 'United States', dial: '+1',   flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom',dial: '+44',  flag: '🇬🇧' },
  { code: 'CA', name: 'Canada',        dial: '+1',   flag: '🇨🇦' },
  { code: 'AU', name: 'Australia',     dial: '+61',  flag: '🇦🇺' },
  { code: 'AE', name: 'UAE',           dial: '+971', flag: '🇦🇪' },
  { code: 'SG', name: 'Singapore',     dial: '+65',  flag: '🇸🇬' },
  { code: 'SA', name: 'Saudi Arabia',  dial: '+966', flag: '🇸🇦' },
  { code: 'MY', name: 'Malaysia',      dial: '+60',  flag: '🇲🇾' },
  { code: 'NZ', name: 'New Zealand',   dial: '+64',  flag: '🇳🇿' },
  { code: 'DE', name: 'Germany',       dial: '+49',  flag: '🇩🇪' },
  { code: 'FR', name: 'France',        dial: '+33',  flag: '🇫🇷' },
  { code: 'IT', name: 'Italy',         dial: '+39',  flag: '🇮🇹' },
  { code: 'ES', name: 'Spain',         dial: '+34',  flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands',   dial: '+31',  flag: '🇳🇱' },
  { code: 'CH', name: 'Switzerland',   dial: '+41',  flag: '🇨🇭' },
  { code: 'SE', name: 'Sweden',        dial: '+46',  flag: '🇸🇪' },
  { code: 'NO', name: 'Norway',        dial: '+47',  flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark',       dial: '+45',  flag: '🇩🇰' },
  { code: 'FI', name: 'Finland',       dial: '+358', flag: '🇫🇮' },
  { code: 'IE', name: 'Ireland',       dial: '+353', flag: '🇮🇪' },
  { code: 'BE', name: 'Belgium',       dial: '+32',  flag: '🇧🇪' },
  { code: 'AT', name: 'Austria',       dial: '+43',  flag: '🇦🇹' },
  { code: 'PT', name: 'Portugal',      dial: '+351', flag: '🇵🇹' },
  { code: 'PL', name: 'Poland',        dial: '+48',  flag: '🇵🇱' },
  { code: 'CZ', name: 'Czech Republic',dial: '+420', flag: '🇨🇿' },
  { code: 'GR', name: 'Greece',        dial: '+30',  flag: '🇬🇷' },
  { code: 'IL', name: 'Israel',        dial: '+972', flag: '🇮🇱' },
  { code: 'TR', name: 'Turkey',        dial: '+90',  flag: '🇹🇷' },
  { code: 'EG', name: 'Egypt',         dial: '+20',  flag: '🇪🇬' },
  { code: 'ZA', name: 'South Africa',  dial: '+27',  flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria',       dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya',         dial: '+254', flag: '🇰🇪' },
  { code: 'JP', name: 'Japan',         dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea',   dial: '+82',  flag: '🇰🇷' },
  { code: 'CN', name: 'China',         dial: '+86',  flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong',     dial: '+852', flag: '🇭🇰' },
  { code: 'TW', name: 'Taiwan',        dial: '+886', flag: '🇹🇼' },
  { code: 'TH', name: 'Thailand',      dial: '+66',  flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam',       dial: '+84',  flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines',   dial: '+63',  flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia',     dial: '+62',  flag: '🇮🇩' },
  { code: 'PK', name: 'Pakistan',      dial: '+92',  flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh',    dial: '+880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka',     dial: '+94',  flag: '🇱🇰' },
  { code: 'NP', name: 'Nepal',         dial: '+977', flag: '🇳🇵' },
  { code: 'BR', name: 'Brazil',        dial: '+55',  flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico',        dial: '+52',  flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina',     dial: '+54',  flag: '🇦🇷' },
  { code: 'CL', name: 'Chile',         dial: '+56',  flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia',      dial: '+57',  flag: '🇨🇴' },
  { code: 'RU', name: 'Russia',        dial: '+7',   flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine',       dial: '+380', flag: '🇺🇦' },
  { code: 'QA', name: 'Qatar',         dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait',        dial: '+965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain',       dial: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman',          dial: '+968', flag: '🇴🇲' },
  { code: 'JO', name: 'Jordan',        dial: '+962', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon',       dial: '+961', flag: '🇱🇧' },
  { code: 'MA', name: 'Morocco',       dial: '+212', flag: '🇲🇦' },
];

export function getCountryByCode(code) {
  return COUNTRIES.find(c => c.code === code) || COUNTRIES[0]; // default India
}

export default function CountryPicker({ visible, onClose, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [search]);

  function handleSelect(country) {
    setSearch('');
    onSelect(country);
    onClose();
  }

  function handleClose() {
    setSearch('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      transparent={false}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Select country</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search country or code"
              placeholderTextColor={GRAY}
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            initialNumToRender={20}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>No country found</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleSelect(item)}
                activeOpacity={0.6}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.dial}>{item.dial}</Text>
              </TouchableOpacity>
            )}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: BG },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
                    borderBottomColor: '#E5E7EB', backgroundColor: '#FFF' },
  title:          { fontSize: 18, fontWeight: '700', color: DARK },
  closeBtn:       { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6',
                    alignItems: 'center', justifyContent: 'center' },
  closeBtnText:   { fontSize: 16, color: GRAY, fontWeight: '700' },

  searchBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
                    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1,
                    borderBottomColor: '#F3F4F6' },
  searchIcon:     { fontSize: 16, marginRight: 8 },
  searchInput:    { flex: 1, fontSize: 15, color: DARK, padding: 8,
                    backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 12 },

  row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
                    paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
                    backgroundColor: '#FFF' },
  flag:           { fontSize: 22, marginRight: 14 },
  name:           { flex: 1, fontSize: 15, color: DARK, fontWeight: '500' },
  dial:           { fontSize: 14, color: GRAY, fontWeight: '600' },

  emptyText:      { textAlign: 'center', color: GRAY, paddingTop: 40, fontSize: 14 },
});
