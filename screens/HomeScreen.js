import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, SafeAreaView, Modal, TextInput, Alert
} from 'react-native';
import { getReports, getPrescriptions } from '../storage';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const ORANGE  = '#F59E0B';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

function MemberDropdown({ members, activeMember, onSwitch, visible, onClose }) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <TouchableOpacity style={dd.overlay} onPress={onClose} activeOpacity={1}>
        <View style={dd.menu}>
          <Text style={dd.menuTitle}>Switch Profile</Text>
          {members.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[dd.menuItem, activeMember?.id === m.id && dd.menuItemActive]}
              onPress={() => { onSwitch(m); onClose(); }}
              activeOpacity={0.8}
            >
              <View style={[dd.menuAvatar, { backgroundColor: activeMember?.id === m.id ? TEAL : '#E5E7EB' }]}>
                <Text style={[dd.menuAvatarText, { color: activeMember?.id === m.id ? '#FFF' : GRAY }]}>
                  {m.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={dd.menuInfo}>
                <Text style={dd.menuName}>{m.name}</Text>
                <Text style={dd.menuSub}>{m.relation}  ·  {m.age} yrs  ·  {m.location}</Text>
              </View>
              {activeMember?.id === m.id && <Text style={dd.menuCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function HomeScreen({
  navigation, members, activeMember,
  onSwitchMember, onLogout, onUpdateMembers
}) {
  const [showDropdown,     setShowDropdown]     = useState(false);
  const [showFamilyMgr,    setShowFamilyMgr]    = useState(false);
  const [showAddMember,    setShowAddMember]    = useState(false);
  const [reportCount,      setReportCount]      = useState(0);
  const [medicineCount,    setMedicineCount]    = useState(0);
  const [refillCount,      setRefillCount]      = useState(0);

  // Add member form state
  const [newName,     setNewName]     = useState('');
  const [newAge,      setNewAge]      = useState('');
  const [newGender,   setNewGender]   = useState('Male');
  const [newLocation, setNewLocation] = useState('');
  const [newRelation, setNewRelation] = useState('Spouse');

  useEffect(() => { loadCounts(); }, [activeMember]);

  async function loadCounts() {
    try {
      const memberId = activeMember?.id || 'default';
      const reports  = await getReports(memberId);
      const rxList   = await getPrescriptions(memberId);
      const active   = rxList.filter(r => r.active);
      const refills  = active.filter(r => r.daysLeft <= 7);
      setReportCount(reports.length);
      setMedicineCount(active.length);
      setRefillCount(refills.length);
    } catch(e) { console.log('loadCounts error:', e); }
  }

  async function handleAddMember() {
    if (!newName.trim()) { Alert.alert('Required', 'Please enter a name.'); return; }
    if (!newAge.trim())  { Alert.alert('Required', 'Please enter an age.');  return; }
    const newMember = {
      id:       Date.now().toString(),
      name:     newName.trim(),
      age:      newAge.trim(),
      gender:   newGender,
      location: newLocation.trim() || 'Not specified',
      relation: newRelation,
    };
    const updated = [...members, newMember];
    onUpdateMembers(updated);
    setNewName(''); setNewAge(''); setNewGender('Male');
    setNewLocation(''); setNewRelation('Spouse');
    setShowAddMember(false);
    Alert.alert('✅ Added', `${newMember.name} has been added to your family profiles.`);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.memberSwitch} onPress={() => setShowDropdown(true)} activeOpacity={0.8}>
            <View style={s.memberSwitchAvatar}>
              <Text style={s.memberSwitchAvatarText}>
                {activeMember?.name?.charAt(0).toUpperCase() || 'M'}
              </Text>
            </View>
            <View>
              <Text style={s.memberSwitchName}>{activeMember?.name || 'My Profile'}</Text>
              <Text style={s.memberSwitchSub}>{activeMember?.relation}  ·  {activeMember?.location} ▾</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={s.logoutBtn} onPress={onLogout}>
            <Text style={s.logoutText}>⎋ Logout</Text>
          </TouchableOpacity>
        </View>

        {/* ── Refill alert ── */}
        {refillCount > 0 && (
          <TouchableOpacity style={s.alertBanner} onPress={() => navigation.navigate('Prescriptions')} activeOpacity={0.8}>
            <View style={s.alertDot} />
            <Text style={s.alertText}>{refillCount} medication{refillCount > 1 ? 's' : ''} need refill soon</Text>
            <Text style={s.alertAction}>View →</Text>
          </TouchableOpacity>
        )}

        {/* ── Stats ── */}
        <Text style={s.sectionTitle}>Overview</Text>
        <View style={s.statsRow}>
          <TouchableOpacity
            style={[s.statCard, { borderTopColor: TEAL }]}
            onPress={() => navigation.navigate('Reports')}
            activeOpacity={0.8}
          >
            <Text style={s.statEmoji}>📋</Text>
            <Text style={[s.statValue, { color: TEAL }]}>{reportCount}</Text>
            <Text style={s.statLabel}>Lab Reports</Text>
            <Text style={s.statHint}>Tap to view →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.statCard, { borderTopColor: GREEN }]}
            onPress={() => navigation.navigate('Prescriptions')}
            activeOpacity={0.8}
          >
            <Text style={s.statEmoji}>💊</Text>
            <Text style={[s.statValue, { color: GREEN }]}>{medicineCount}</Text>
            <Text style={s.statLabel}>Active Medicines</Text>
            <Text style={s.statHint}>Tap to view →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Actions ── */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { emoji: '📤', label: 'Upload\nReport',    color: TEAL,      action: () => navigation.navigate('Reports') },
            { emoji: '✍️', label: 'Add\nPrescription', color: GREEN,     action: () => navigation.navigate('Prescriptions') },
            { emoji: '📈', label: 'Health\nTimeline',  color: '#7C3AED', action: () => navigation.navigate('Timeline') },
            { emoji: '👨‍👩‍👧', label: 'Family\nProfiles', color: ORANGE,    action: () => setShowFamilyMgr(true) },
          ].map((a, i) => (
            <TouchableOpacity key={i} style={s.actionCard} onPress={a.action} activeOpacity={0.8}>
              <View style={[s.actionIcon, { backgroundColor: a.color + '18' }]}>
                <Text style={s.actionEmoji}>{a.emoji}</Text>
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Current Profile ── */}
        <Text style={s.sectionTitle}>Current Profile</Text>
        <View style={s.profileCard}>
          <View style={s.profileAvatar}>
            <Text style={s.profileAvatarText}>
              {activeMember?.name?.charAt(0).toUpperCase() || 'M'}
            </Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{activeMember?.name}</Text>
            <Text style={s.profileDetail}>{activeMember?.gender}  ·  {activeMember?.age} years old</Text>
            <Text style={s.profileDetail}>📍 {activeMember?.location}</Text>
            <Text style={s.profileDetail}>👥 {activeMember?.relation}</Text>
          </View>
          <TouchableOpacity style={s.switchBtn} onPress={() => setShowDropdown(true)}>
            <Text style={s.switchBtnText}>Switch</Text>
          </TouchableOpacity>
        </View>

        {/* ── Family strip ── */}
        {members.length > 1 && (
          <>
            <Text style={s.sectionTitle}>Family Members</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.familyStrip} contentContainerStyle={{ paddingHorizontal: 2, gap: 12 }}>
              {members.map(m => (
                <TouchableOpacity key={m.id} style={s.familyChip} onPress={() => onSwitchMember(m)} activeOpacity={0.8}>
                  <View style={[s.familyAvatar, { backgroundColor: activeMember?.id === m.id ? TEAL : '#E5E7EB' }]}>
                    <Text style={[s.familyAvatarText, { color: activeMember?.id === m.id ? '#FFF' : GRAY }]}>
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[s.familyName, activeMember?.id === m.id && { color: TEAL }]}>{m.name.split(' ')[0]}</Text>
                  <Text style={s.familyRelation}>{m.relation}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.addFamilyChip} onPress={() => setShowFamilyMgr(true)} activeOpacity={0.8}>
                <View style={s.addFamilyCircle}>
                  <Text style={s.addFamilyIcon}>➕</Text>
                </View>
                <Text style={s.addFamilyText}>Add</Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        )}

        {/* ── Health tip ── */}
        <View style={s.tipCard}>
          <Text style={s.tipEmoji}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.tipTitle}>Health Tip</Text>
            <Text style={s.tipText}>Keep all your lab reports in one place for faster doctor consultations and better health tracking.</Text>
          </View>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ── Member Dropdown ── */}
      <MemberDropdown
        members={members}
        activeMember={activeMember}
        onSwitch={onSwitchMember}
        visible={showDropdown}
        onClose={() => setShowDropdown(false)}
      />

      {/* ── Family Manager Modal ── */}
      <Modal visible={showFamilyMgr} animationType="slide" transparent>
        <View style={fm.overlay}>
          <View style={fm.sheet}>
            <View style={fm.handle} />
            <View style={fm.header}>
              <Text style={fm.title}>Family Profiles</Text>
              <TouchableOpacity style={fm.closeBtn} onPress={() => setShowFamilyMgr(false)}>
                <Text style={fm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {members.map(m => (
                <View key={m.id} style={fm.memberRow}>
                  <View style={[fm.avatar, { backgroundColor: activeMember?.id === m.id ? TEAL : '#E5E7EB' }]}>
                    <Text style={[fm.avatarText, { color: activeMember?.id === m.id ? '#FFF' : GRAY }]}>
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={fm.memberInfo}>
                    <Text style={fm.memberName}>{m.name}</Text>
                    <Text style={fm.memberSub}>{m.relation}  ·  {m.age} yrs  ·  {m.gender}</Text>
                    <Text style={fm.memberLoc}>📍 {m.location}</Text>
                  </View>
                  <TouchableOpacity
                    style={[fm.selectBtn, activeMember?.id === m.id && fm.selectBtnActive]}
                    onPress={() => { onSwitchMember(m); setShowFamilyMgr(false); }}
                  >
                    <Text style={[fm.selectBtnText, activeMember?.id === m.id && { color: TEAL }]}>
                      {activeMember?.id === m.id ? '✓ Active' : 'Select'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={fm.addBtn}
                onPress={() => { setShowFamilyMgr(false); setShowAddMember(true); }}
                activeOpacity={0.8}
              >
                <Text style={fm.addBtnIcon}>➕</Text>
                <Text style={fm.addBtnText}>Add Family Member</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Member Modal ── */}
      <Modal visible={showAddMember} animationType="slide" transparent>
        <View style={fm.overlay}>
          <View style={fm.sheet}>
            <View style={fm.handle} />
            <View style={fm.header}>
              <Text style={fm.title}>Add Family Member</Text>
              <TouchableOpacity style={fm.closeBtn} onPress={() => setShowAddMember(false)}>
                <Text style={fm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fm.fieldLabel}>Full Name</Text>
              <TextInput style={fm.input} placeholder="e.g. Ravi Kumar" value={newName} onChangeText={setNewName} />

              <Text style={fm.fieldLabel}>Age</Text>
              <TextInput style={fm.input} placeholder="e.g. 58" value={newAge} onChangeText={setNewAge} keyboardType="numeric" />

              <Text style={fm.fieldLabel}>Gender</Text>
              <View style={fm.chipRow}>
                {['Male', 'Female', 'Other'].map(g => (
                  <TouchableOpacity key={g} style={[fm.chip, newGender === g && fm.chipActive]} onPress={() => setNewGender(g)}>
                    <Text style={[fm.chipText, newGender === g && fm.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={fm.fieldLabel}>Location</Text>
              <TextInput style={fm.input} placeholder="e.g. Chennai, Tamil Nadu" value={newLocation} onChangeText={setNewLocation} />

              <Text style={fm.fieldLabel}>Relationship</Text>
              <View style={fm.chipRow}>
                {['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'].map(r => (
                  <TouchableOpacity key={r} style={[fm.chip, newRelation === r && fm.chipActive]} onPress={() => setNewRelation(r)}>
                    <Text style={[fm.chipText, newRelation === r && fm.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={fm.actions}>
                <TouchableOpacity style={fm.cancelBtn} onPress={() => setShowAddMember(false)}>
                  <Text style={fm.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={fm.saveBtn} onPress={handleAddMember}>
                  <Text style={fm.saveText}>Add Member</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:                   { flex: 1, backgroundColor: BG },
  scroll:                 { paddingHorizontal: 20 },
  topBar:                 { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 16 },
  memberSwitch:           { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  memberSwitchAvatar:     { width: 44, height: 44, borderRadius: 14, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: TEAL, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  memberSwitchAvatarText: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  memberSwitchName:       { fontSize: 16, fontWeight: '800', color: DARK },
  memberSwitchSub:        { fontSize: 12, color: GRAY, marginTop: 1 },
  logoutBtn:              { backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  logoutText:             { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  alertBanner:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 20, gap: 8, borderWidth: 1, borderColor: '#FDE68A' },
  alertDot:               { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE },
  alertText:              { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '500' },
  alertAction:            { fontSize: 13, color: ORANGE, fontWeight: '700' },
  sectionTitle:           { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 12 },
  statsRow:               { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard:               { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderTopWidth: 3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, alignItems: 'center' },
  statEmoji:              { fontSize: 28, marginBottom: 8 },
  statValue:              { fontSize: 32, fontWeight: '800' },
  statLabel:              { fontSize: 12, color: GRAY, marginTop: 4, textAlign: 'center', fontWeight: '500' },
  statHint:               { fontSize: 11, color: TEAL, marginTop: 6, fontWeight: '600' },
  actionsGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  actionCard:             { width: '47%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
  actionIcon:             { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionEmoji:            { fontSize: 24 },
  actionLabel:            { fontSize: 12, fontWeight: '600', color: DARK, textAlign: 'center', lineHeight: 17 },
  profileCard:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 24, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, gap: 14 },
  profileAvatar:          { width: 56, height: 56, borderRadius: 16, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText:      { color: '#FFF', fontWeight: '800', fontSize: 24 },
  profileInfo:            { flex: 1 },
  profileName:            { fontSize: 16, fontWeight: '800', color: DARK, marginBottom: 4 },
  profileDetail:          { fontSize: 12, color: GRAY, marginTop: 2 },
  switchBtn:              { backgroundColor: TEAL_LT, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  switchBtnText:          { fontSize: 13, color: TEAL, fontWeight: '700' },
  familyStrip:            { marginBottom: 24 },
  familyChip:             { alignItems: 'center', width: 72 },
  familyAvatar:           { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  familyAvatarText:       { fontSize: 20, fontWeight: '800' },
  familyName:             { fontSize: 12, fontWeight: '600', color: DARK, textAlign: 'center' },
  familyRelation:         { fontSize: 10, color: GRAY, textAlign: 'center', marginTop: 1 },
  addFamilyChip:          { alignItems: 'center', width: 72 },
  addFamilyCircle:        { width: 52, height: 52, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  addFamilyIcon:          { fontSize: 22 },
  addFamilyText:          { fontSize: 12, color: GRAY, fontWeight: '500' },
  tipCard:                { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16, gap: 12 },
  tipEmoji:               { fontSize: 22, marginTop: 2 },
  tipTitle:               { fontSize: 13, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
  tipText:                { fontSize: 13, color: '#3B82F6', lineHeight: 19 },
});

const dd = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 20 },
  menu:           { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  menuTitle:      { fontSize: 14, fontWeight: '700', color: GRAY, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 6, backgroundColor: '#F9FAFB' },
  menuItemActive: { backgroundColor: TEAL_LT },
  menuAvatar:     { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuAvatarText: { fontSize: 18, fontWeight: '800' },
  menuInfo:       { flex: 1 },
  menuName:       { fontSize: 15, fontWeight: '700', color: DARK },
  menuSub:        { fontSize: 12, color: GRAY, marginTop: 2 },
  menuCheck:      { fontSize: 18, color: TEAL, fontWeight: '700' },
});

const fm = StyleSheet.create({
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, maxHeight: '90%' },
  handle:          { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:           { fontSize: 20, fontWeight: '800', color: DARK },
  closeBtn:        { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:    { fontSize: 14, color: GRAY, fontWeight: '700' },
  memberRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 10, gap: 12 },
  avatar:          { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText:      { fontSize: 18, fontWeight: '800' },
  memberInfo:      { flex: 1 },
  memberName:      { fontSize: 15, fontWeight: '700', color: DARK },
  memberSub:       { fontSize: 12, color: GRAY, marginTop: 2 },
  memberLoc:       { fontSize: 12, color: GRAY, marginTop: 2 },
  selectBtn:       { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  selectBtnActive: { backgroundColor: TEAL_LT },
  selectBtnText:   { fontSize: 12, fontWeight: '700', color: GRAY },
  addBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginTop: 8, borderWidth: 2, borderColor: TEAL, borderStyle: 'dashed', gap: 10 },
  addBtnIcon:      { fontSize: 20 },
  addBtnText:      { fontSize: 15, fontWeight: '700', color: TEAL },
  fieldLabel:      { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 8 },
  input:           { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 14, color: DARK, marginBottom: 16, backgroundColor: '#FAFAFA' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipActive:      { backgroundColor: TEAL_LT, borderColor: TEAL },
  chipText:        { fontSize: 13, color: GRAY, fontWeight: '500' },
  chipTextActive:  { color: TEAL, fontWeight: '700' },
  actions:         { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:       { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText:      { fontSize: 14, color: GRAY, fontWeight: '600' },
  saveBtn:         { flex: 1, padding: 15, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center' },
  saveText:        { fontSize: 14, color: '#FFF', fontWeight: '700' },
});