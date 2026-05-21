import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,ActivityIndicator,
  TouchableOpacity, SafeAreaView, Modal, TextInput, Alert
} from 'react-native';
import { getReports, getPrescriptions } from '../storage';
import * as Location from 'expo-location';

const TEAL    = '#0B8FAC';
const TEAL_LT = '#E8F7FA';
const GREEN   = '#0D9E6E';
const GREEN_LT= '#DCFCE7';
const ORANGE  = '#F59E0B';
const PURPLE  = '#7C3AED';
const PURPLE_LT='#F3E8FF';
const BLUE    = '#3B82F6';
const BLUE_LT = '#DBEAFE';
const PEACH_LT= '#FED7AA';
const GRAY    = '#6B7280';
const DARK    = '#111827';
const BG      = '#F5F7FA';

// ── Pro Tips by Age ──────────────────────────────────────────────────
// Multiple tips per age band — we rotate through them based on day-of-month
// so the user sees something fresh on different days but consistent on a single day.
const PRO_TIPS = {
  pediatric: [
    'Vaccination records and growth charts are key during the early years — keep all checkup notes in one place.',
    'Annual height and weight tracking helps doctors spot growth patterns. Upload pediatrician reports as you get them.',
    'Childhood immunization schedules vary by age. Saving each vaccination record makes future doctor visits easier.',
  ],
  young: [
    'Get a baseline cholesterol and blood sugar check by 30 — earlier if heart disease runs in the family.',
    'Even if you feel fine, an annual full-body checkup catches small issues before they grow.',
    'Daily steps, sleep hours, and BP readings are great to track at this age — your future self will thank you.',
  ],
  middleEarly: [
    'An annual full-body checkup is a smart habit before any chronic conditions might appear.',
    'Track HbA1c yearly — even mild changes can be the earliest sign of pre-diabetes.',
    'A lipid panel every year helps you stay ahead of cholesterol issues. Upload yours when you get one.',
  ],
  middleLate: [
    'After 50, a yearly bone density check helps catch osteoporosis early. Worth asking your doctor about.',
    'BP at home weekly, fasting sugar quarterly — small habits that pay off in this decade.',
    'Vitamin D and B12 deficiencies are common at this age. Annual checks can prevent fatigue and bone problems.',
  ],
  senior: [
    'Track BP weekly — even small changes matter at this age. Keeping a record helps your doctor decide on dosage.',
    'Annual eye and hearing checks make a real difference in quality of life. Save those reports too.',
    'Bring your full medication list to every doctor visit. The app makes this easy — just open “My Meds”.',
  ],
};

function getProTip(age) {
  const numAge = parseInt(age) || 35;
  let band;
  if (numAge < 18)      band = 'pediatric';
  else if (numAge < 30) band = 'young';
  else if (numAge < 45) band = 'middleEarly';
  else if (numAge < 60) band = 'middleLate';
  else                  band = 'senior';
  const tips = PRO_TIPS[band];
  // Rotate tip based on date — same tip all day, refreshes daily
  const dayOfMonth = new Date().getDate();
  return tips[dayOfMonth % tips.length];
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12)  return 'Good morning';
  if (hour < 17)  return 'Good afternoon';
  return 'Good evening';
}

function todayLong() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

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

// ── Med row in the home list ────────────────────────────────────────
function HomeMedRow({ rx }) {
  return (
    <View style={s.medRow}>
      <View style={s.medIconBox}>
        <Text style={s.medEmoji}>💊</Text>
      </View>
      <View style={s.medInfo}>
        <Text style={s.medName} numberOfLines={1}>{rx.drug}{rx.dose ? ` ${rx.dose}` : ''}</Text>
        {rx.times && rx.times.length > 0 && (
          <Text style={s.medTimes} numberOfLines={1}>{rx.times.join(', ')}</Text>
        )}
      </View>
      <View style={s.medFreq}>
        <Text style={s.medFreqText}>{rx.freqLabel || rx.freq || 'Daily'}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen({
  navigation, members, activeMember,
  onSwitchMember, onLogout, onUpdateMembers
}) {
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [showFamilyMgr,  setShowFamilyMgr]  = useState(false);
  const [showAddMember,  setShowAddMember]  = useState(false);
  const [activeMeds,     setActiveMeds]     = useState([]);
  const [activeMedCount, setActiveMedCount] = useState(0);
const [fetchingLocation, setFetching] = useState(false);

  // Add member form state

  const [newName,     setNewName]     = useState('');
  const [newAge,      setNewAge]      = useState('');
  const [newGender,   setNewGender]   = useState('Male');
  const [newLocation, setNewLocation] = useState('');
  const [newRelation, setNewRelation] = useState('Spouse');


  useEffect(() => { loadHomeData(); }, [activeMember]);
async function handleUseCurrentLocation() {
    setFetching(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location access is needed. You can also type it manually.');
        setFetching(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        const city = addr.city || addr.subregion || addr.district || '';
        const state = addr.region || '';
        const formatted = [city, state].filter(Boolean).join(', ') || 'Unknown';
        setNewLocation(formatted);
      } else {
        Alert.alert('Could not determine location', 'Please type your city manually.');
      }
    } catch (e) {
      console.log('Location error:', e);
      Alert.alert('Could not get location', 'Make sure location services are enabled. You can also type it manually.');
    }
    setFetching(false);
  }

  async function loadHomeData() {
    try {
      const memberId = activeMember?.id || 'default';
      const rxList   = await getPrescriptions(memberId);
      const active   = rxList.filter(r =>
        (r.type === 'discharge' || r.type === 'outpatient' || !r.type) && r.active !== false
      );
      // Show top 3 most recently added active meds on home
      setActiveMeds(active.slice(0, 3));
      setActiveMedCount(active.length);
    } catch(e) { console.log('loadHomeData error:', e); }
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

  const greeting     = getGreeting();
  const firstName    = activeMember?.name?.split(' ')[0] || 'there';
  const proTip       = getProTip(activeMember?.age);

  // Quick action cards — keep the 4 the user asked for
  const QUICK_ACTIONS = [
    { emoji: '📤', title: 'Lab Reports', subtitle: 'Upload & view',     bg: BLUE_LT,   action: () => navigation.navigate('Reports') },
    { emoji: '💊', title: 'My Meds',     subtitle: `${activeMedCount} active`,   bg: GREEN_LT,  action: () => navigation.navigate('Prescriptions') },
    { emoji: '📈', title: 'Lab Trends',  subtitle: 'See your charts',   bg: PURPLE_LT, action: () => navigation.navigate('Timeline') },
    { emoji: '👨‍👩‍👧', title: 'My Family',  subtitle: `${members.length} member${members.length !== 1 ? 's' : ''}`, bg: PEACH_LT, action: () => setShowFamilyMgr(true) },
  ];

 
   return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>


        {/* ── Top bar: subtle profile chip + logout text ── */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.profileChip} onPress={() => setShowDropdown(true)} activeOpacity={0.7}>
            <View style={s.profileChipAvatar}>
              <Text style={s.profileChipAvatarText}>
                {activeMember?.name?.charAt(0).toUpperCase() || 'M'}
              </Text>
            </View>
            <View>
              <Text style={s.profileChipLabel}>Profile</Text>
              <Text style={s.profileChipName}>
                {activeMember?.name?.split(' ')[0]}
                {activeMember?.relation ? ` · ${activeMember.relation}` : ''}
                <Text style={s.profileChipChevron}>  ▾</Text>
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout}>
            <Text style={s.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* ── Greeting ── */}
        <Text style={s.greeting}>{greeting}, {firstName} 👋</Text>
        <Text style={s.todayDate}>{todayLong()}</Text>

        {/* ── Pro Tip (age-aware) ── */}
        <View style={s.tipCard}>
          <Text style={s.tipEmoji}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.tipLabel}>Tip for you</Text>
            <Text style={s.tipText}>{proTip}</Text>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <Text style={s.sectionLabel}>Quick actions</Text>
        <View style={s.actionsGrid}>
          {QUICK_ACTIONS.map((a, i) => (
            <TouchableOpacity key={i} style={s.actionCard} onPress={a.action} activeOpacity={0.8}>
              <View style={[s.actionIcon, { backgroundColor: a.bg }]}>
                <Text style={s.actionEmoji}>{a.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>{a.title}</Text>
                <Text style={s.actionSubtitle}>{a.subtitle}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── My Medications ── */}
        <View style={s.medsHeader}>
          <Text style={s.sectionLabel}>My Medications</Text>
          {activeMedCount > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Prescriptions')}>
              <Text style={s.seeAll}>See all ›</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeMeds.length === 0 ? (
          <TouchableOpacity style={s.medsEmpty} onPress={() => navigation.navigate('Prescriptions')} activeOpacity={0.7}>
            <Text style={s.medsEmptyEmoji}>💊</Text>
            <Text style={s.medsEmptyTitle}>No medications yet</Text>
            <Text style={s.medsEmptyText}>Tap to add your first prescription</Text>
          </TouchableOpacity>
        ) : (
          activeMeds.map(rx => <HomeMedRow key={rx.id} rx={rx} />)
        )}

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
             <TouchableOpacity
                style={fm.locationBtn}
                onPress={handleUseCurrentLocation}
                disabled={fetchingLocation}
                activeOpacity={0.7}
              >
                {fetchingLocation ? (
                  <>
                    <ActivityIndicator size="small" color={TEAL} />
                    <Text style={fm.locationBtnText}>Detecting...</Text>
                  </>
                ) : (
                  <>
                    <Text style={fm.locationBtnIcon}>📍</Text>
                    <Text style={fm.locationBtnText}>Use Current Location</Text>
                  </>
                )}
              </TouchableOpacity>

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

  // Top bar
  topBar:                 { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingBottom: 12 },
  profileChip:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileChipAvatar:      { width: 32, height: 32, borderRadius: 16, backgroundColor: TEAL_LT, alignItems: 'center', justifyContent: 'center' },
  profileChipAvatarText:  { color: TEAL, fontWeight: '700', fontSize: 14 },
  profileChipLabel:       { fontSize: 10, color: GRAY, marginBottom: 1 },
  profileChipName:        { fontSize: 13, fontWeight: '600', color: DARK },
  profileChipChevron:     { fontSize: 10, color: GRAY },
  logoutText:             { fontSize: 13, color: GRAY, fontWeight: '500' },

  // Greeting
  greeting:               { fontSize: 24, fontWeight: '700', color: DARK, marginTop: 4, marginBottom: 4 },
  todayDate:              { fontSize: 13, color: GRAY, marginBottom: 18 },

  // Pro Tip
  tipCard:                { flexDirection: 'row', backgroundColor: '#FEF7E6', borderRadius: 14, padding: 14, gap: 10, marginBottom: 22, borderWidth: 1, borderColor: '#FCE5A6' },
  tipEmoji:               { fontSize: 22, marginTop: 1 },
  tipLabel:               { fontSize: 11, color: '#92400E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' },
  tipText:                { fontSize: 13, color: '#78350F', lineHeight: 19 },

  // Section labels
  sectionLabel:           { fontSize: 11, color: GRAY, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' },

  // Quick Actions grid (4 cards, 2x2)
  actionsGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  actionCard:             { width: '48%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  actionIcon:             { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionEmoji:            { fontSize: 18 },
  actionTitle:            { fontSize: 13, fontWeight: '700', color: DARK },
  actionSubtitle:         { fontSize: 10, color: GRAY, marginTop: 1 },

  // Medications header row
  medsHeader:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  seeAll:                 { fontSize: 12, color: TEAL, fontWeight: '600' },

  // Med row
  medRow:                 { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 6, gap: 10, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  medIconBox:             { width: 36, height: 36, borderRadius: 10, backgroundColor: GREEN_LT, alignItems: 'center', justifyContent: 'center' },
  medEmoji:               { fontSize: 18 },
  medInfo:                { flex: 1 },
  medName:                { fontSize: 13, fontWeight: '600', color: DARK },
  medTimes:               { fontSize: 11, color: GRAY, marginTop: 2 },
  medFreq:                { backgroundColor: TEAL_LT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  medFreqText:            { fontSize: 10, color: TEAL, fontWeight: '600' },

  // Empty state for meds
  medsEmpty:              { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', borderStyle: 'dashed' },
  medsEmptyEmoji:         { fontSize: 32, marginBottom: 6 },
  medsEmptyTitle:         { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 4 },
  medsEmptyText:          { fontSize: 12, color: GRAY },
});

const dd = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 20 },
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
locationBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: TEAL_LT, borderRadius: 12, paddingVertical: 10, marginTop: -8, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: TEAL },
  locationBtnIcon:   { fontSize: 14 },
  locationBtnText:   { fontSize: 13, fontWeight: '700', color: TEAL },
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