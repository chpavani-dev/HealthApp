import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, SafeAreaView, ScrollView,
  Modal, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

const GENDERS   = ['Male', 'Female', 'Other'];
const RELATIONS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'];

function MemberCard({ member, isActive, onPress, onEdit, onDelete }) {
  return (
    <TouchableOpacity
      style={[s.memberCard, isActive && s.memberCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[s.memberAvatar, { backgroundColor: isActive ? TEAL : '#E5E7EB' }]}>
        <Text style={[s.memberAvatarText, { color: isActive ? '#FFF' : GRAY }]}>
          {member.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={s.memberInfo}>
        <Text style={s.memberName}>{member.name}</Text>
        <Text style={s.memberSub}>{member.relation}  ·  {member.age} yrs  ·  {member.gender}</Text>
        <Text style={s.memberLocation}>📍 {member.location}</Text>
      </View>
      <View style={s.memberActions}>
        <TouchableOpacity style={s.editBtn} onPress={() => onEdit(member)}>
          <Text style={s.editBtnText}>✏️</Text>
        </TouchableOpacity>
        {member.relation !== 'Self' && (
          <TouchableOpacity style={s.deleteBtn} onPress={() => onDelete(member.id)}>
            <Text style={s.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function MemberFormModal({ visible, member, onSave, onClose }) {
  const [name, setName]                 = useState(member?.name || '');
  const [age, setAge]                   = useState(member?.age || '');
  const [gender, setGender]             = useState(member?.gender || 'Male');
  const [location, setLocation]         = useState(member?.location || '');
  const [relation, setRelation]         = useState(member?.relation || 'Self');
  const [fetchingLocation, setFetching] = useState(false);

  React.useEffect(() => {
    if (member) {
      setName(member.name || '');
      setAge(member.age || '');
      setGender(member.gender || 'Male');
      setLocation(member.location || '');
      setRelation(member.relation || 'Self');
    }
  }, [member]);

  async function handleUseCurrentLocation() {
    setFetching(true);
    try {
      // Step 1: request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Location access is needed to detect your city. You can also type it manually.'
        );
        setFetching(false);
        return;
      }

      // Step 2: get coordinates
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;

      // Step 3: reverse-geocode to address
      const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        const city = addr.city || addr.subregion || addr.district || '';
        const state = addr.region || '';
        const formatted = [city, state].filter(Boolean).join(', ') || 'Unknown';
        setLocation(formatted);
      } else {
        Alert.alert('Could not determine location', 'Please type your city manually.');
      }
    } catch (e) {
      console.log('Location error:', e);
      Alert.alert(
        'Could not get location',
        'Make sure location services are enabled on your phone. You can also type it manually.'
      );
    }
    setFetching(false);
  }

  function handleSave() {
    if (!name.trim()) { Alert.alert('Missing info', 'Please enter a name.'); return; }
    if (!age.trim())  { Alert.alert('Missing info', 'Please enter an age.');  return; }
    onSave({
      id:       member?.id || Date.now().toString(),
      name:     name.trim(),
      age:      age.trim(),
      gender,
      location: location.trim() || 'Not specified',
      relation,
    });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{member?.id ? 'Edit Profile' : 'Add Family Member'}</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.fieldLabel}>Full Name</Text>
            <TextInput style={s.input} placeholder="e.g. Priya Sharma" value={name} onChangeText={setName} />

            <Text style={s.fieldLabel}>Age</Text>
            <TextInput style={s.input} placeholder="e.g. 42" value={age} onChangeText={setAge} keyboardType="numeric" />

            <Text style={s.fieldLabel}>Gender</Text>
            <View style={s.chipRow}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g}
                  style={[s.chip, gender === g && s.chipActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[s.chipText, gender === g && s.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Location</Text>
            <TextInput style={s.input} placeholder="e.g. Mumbai, Maharashtra" value={location} onChangeText={setLocation} />
            <TouchableOpacity
              style={s.locationBtn}
              onPress={handleUseCurrentLocation}
              disabled={fetchingLocation}
              activeOpacity={0.7}
            >
              {fetchingLocation ? (
                <>
                  <ActivityIndicator size="small" color={TEAL} />
                  <Text style={s.locationBtnText}>Detecting your location...</Text>
                </>
              ) : (
                <>
                  <Text style={s.locationBtnIcon}>📍</Text>
                  <Text style={s.locationBtnText}>Use Current Location</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Relationship</Text>
            <View style={s.chipRow}>
              {RELATIONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.chip, relation === r && s.chipActive]}
                  onPress={() => setRelation(r)}
                >
                  <Text style={[s.chipText, relation === r && s.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={s.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity style={s.closeX} onPress={onClose}>
            <Text style={s.closeXText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ProfileScreen({ onProfileComplete, existingMembers }) {
  const [members, setMembers]       = useState(existingMembers || []);
  const [showForm, setShowForm]     = useState(!existingMembers?.length);
  const [editMember, setEditMember] = useState(null);
  const [activeMember, setActive]   = useState(existingMembers?.[0] || null);

  async function saveMember(member) {
    let updated;
    const existing = members.find(m => m.id === member.id);
    if (existing) {
      updated = members.map(m => m.id === member.id ? member : m);
    } else {
      updated = [...members, member];
    }
    setMembers(updated);
    if (!activeMember) setActive(updated[0]);
    await AsyncStorage.setItem('members', JSON.stringify(updated));
    setEditMember(null);
    setShowForm(false);
  }

  async function deleteMember(id) {
    Alert.alert(
      'Remove member',
      'Are you sure you want to remove this family member?',
      [
        { text: 'Cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = members.filter(m => m.id !== id);
            setMembers(updated);
            await AsyncStorage.setItem('members', JSON.stringify(updated));
            if (activeMember?.id === id) setActive(updated[0] || null);
          }
        }
      ]
    );
  }

  function handleDone() {
    if (members.length === 0) {
      Alert.alert('Profile required', 'Please add at least one profile to continue.');
      return;
    }
    onProfileComplete(members, activeMember || members[0]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <View style={s.logoCircle}>
            <Text style={{ fontSize: 30 }}>🏥</Text>
          </View>
          <Text style={s.title}>Set Up Your Profile</Text>
          <Text style={s.subtitle}>Add yourself and your family members to manage everyone's health records</Text>
        </View>

        {members.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Profiles ({members.length})</Text>
            {members.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                isActive={activeMember?.id === m.id}
                onPress={() => setActive(m)}
                onEdit={(m) => { setEditMember(m); setShowForm(true); }}
                onDelete={deleteMember}
              />
            ))}
          </>
        )}

        <TouchableOpacity
          style={s.addMemberBtn}
          onPress={() => { setEditMember(null); setShowForm(true); }}
          activeOpacity={0.8}
        >
          <Text style={s.addMemberIcon}>➕</Text>
          <Text style={s.addMemberText}>
            {members.length === 0 ? 'Add Your Profile' : 'Add Family Member'}
          </Text>
        </TouchableOpacity>

        {members.length > 0 && (
          <TouchableOpacity style={s.continueBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={s.continueBtnText}>Continue to App →</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <MemberFormModal
        visible={showForm}
        member={editMember}
        onSave={saveMember}
        onClose={() => { setShowForm(false); setEditMember(null); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: BG },
  scroll:            { paddingHorizontal: 24 },

  header:            { alignItems: 'center', paddingTop: 40, paddingBottom: 32 },
  logoCircle:        { width: 80, height: 80, borderRadius: 24, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 4, shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  title:             { fontSize: 24, fontWeight: '800', color: DARK, textAlign: 'center', marginBottom: 8 },
  subtitle:          { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },

  sectionTitle:      { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 12 },

  memberCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, borderWidth: 1.5, borderColor: 'transparent' },
  memberCardActive:  { borderColor: TEAL, backgroundColor: TEAL_LT },
  memberAvatar:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  memberAvatarText:  { fontSize: 20, fontWeight: '800' },
  memberInfo:        { flex: 1 },
  memberName:        { fontSize: 15, fontWeight: '700', color: DARK },
  memberSub:         { fontSize: 12, color: GRAY, marginTop: 2 },
  memberLocation:    { fontSize: 12, color: GRAY, marginTop: 2 },
  memberActions:     { flexDirection: 'row', gap: 8 },
  editBtn:           { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  editBtnText:       { fontSize: 16 },
  deleteBtn:         { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:     { fontSize: 16 },

  addMemberBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginTop: 8, marginBottom: 16, borderWidth: 2, borderColor: TEAL, borderStyle: 'dashed', gap: 10 },
  addMemberIcon:     { fontSize: 20 },
  addMemberText:     { fontSize: 15, fontWeight: '700', color: TEAL },

  continueBtn:       { backgroundColor: TEAL, borderRadius: 16, paddingVertical: 18, alignItems: 'center', elevation: 3, shadowColor: TEAL, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
  continueBtnText:   { color: '#FFF', fontSize: 16, fontWeight: '700' },

  overlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:             { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, maxHeight: '92%' },
  sheetHandle:       { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:        { fontSize: 20, fontWeight: '800', color: DARK, marginBottom: 20 },

  fieldLabel:        { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 8 },
  input:             { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 14, color: DARK, marginBottom: 16, backgroundColor: '#FAFAFA' },

  // Location button
  locationBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: TEAL_LT, borderRadius: 12, paddingVertical: 12, marginTop: -8, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: TEAL },
  locationBtnIcon:   { fontSize: 16 },
  locationBtnText:   { fontSize: 13, fontWeight: '700', color: TEAL },

  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:              { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipActive:        { backgroundColor: TEAL_LT, borderColor: TEAL },
  chipText:          { fontSize: 13, color: GRAY, fontWeight: '500' },
  chipTextActive:    { color: TEAL, fontWeight: '700' },

  modalActions:      { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:         { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText:        { fontSize: 14, color: GRAY, fontWeight: '600' },
  saveBtn:           { flex: 1, padding: 15, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center' },
  saveText:          { fontSize: 14, color: '#FFF', fontWeight: '700' },

  closeX:            { position: 'absolute', top: 20, right: 20, padding: 8 },
  closeXText:        { fontSize: 18, color: '#9CA3AF' },
});
