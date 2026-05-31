import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReports, getPrescriptions } from '../storage';
import { createInvite, acceptInvite, buildWhatsAppShareMessage, listSharesIveGranted, listMyInvites, listSharesWithMe, revokeShare, cancelInvite, getMyPermissionForMember } from '../sharing';
import { usePermission } from '../PermissionContext';
import { pullAllForUser } from '../cloudSync';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
const { setPermission } = usePermission();
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
const [shareModalFor,    setShareModalFor]    = useState(null);
  const [shareCode,        setShareCode]        = useState(null);
  const [sharePhone,       setSharePhone]       = useState('');
const [showAcceptModal, setShowAcceptModal] = useState(false);
const [acceptCode, setAcceptCode] = useState('');
const [acceptLoading, setAcceptLoading] = useState(false);
const [showManageModal,    setShowManageModal]    = useState(false);
  const [grantedShares,      setGrantedShares]      = useState([]);
  const [pendingInvites,     setPendingInvites]     = useState([]);
  const [sharesWithMe,       setSharesWithMe]       = useState([]);
  const [memberPermissions,  setMemberPermissions]  = useState({});  // {memberId: 'view'|'edit'|'admin'|'owner'}
  const [manageLoading,      setManageLoading]      = useState(false);
  const [sharePermission,  setSharePermission]  = useState('edit');
  const [shareGenerating,  setShareGenerating]  = useState(false);

async function handleGenerateInvite() {
    if (!sharePhone || sharePhone.trim().length < 8) {
      Alert.alert('Phone required', "Please enter the invitee's phone number with country code (e.g., +91...).");
      return;
    }
    if (!shareModalFor) return;
    setShareGenerating(true);
    const result = await createInvite(shareModalFor.id, sharePhone.trim(), sharePermission);
    setShareGenerating(false);
    if (result.error) {
      Alert.alert('Error', String(result.error));
      return;
    }
    setShareCode(result.code);
  }

  async function handleShareViaWhatsApp() {
    if (!shareCode || !shareModalFor) return;
    const message = buildWhatsAppShareMessage(shareCode, shareModalFor.name);
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const can = await Linking.canOpenURL(url);
    if (can) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp not found', 'WhatsApp is not installed. Tap "Copy Code" to share via another app.');
    }
  }

  function handleCloseShareModal() {
    setShareModalFor(null);
    setShareCode(null);
    setSharePhone('');
    setSharePermission('edit');
    setShareGenerating(false);
  }
// ── Manage Shares Modal handlers ──
  async function openManageShares() {
    setShowFamilyMgr(false);
    setShowManageModal(true);
    setManageLoading(true);

    const [g, i, sw] = await Promise.all([
      listSharesIveGranted(),
      listMyInvites(),
      listSharesWithMe(),
    ]);

    setGrantedShares(g.shares || []);
    setPendingInvites((i.invites || []).filter(inv => inv.status === 'pending'));
    setSharesWithMe(sw.shares || []);
    setManageLoading(false);
  }

  async function handleRevokeShare(shareId, memberName) {
    Alert.alert(
      'Revoke access?',
      `Remove access to ${memberName || 'this member'}? The other person will no longer see records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: async () => {
          const result = await revokeShare(shareId);
          if (result.error) {
            Alert.alert('Error', `Could not revoke: ${result.error}`);
            return;
          }
          setGrantedShares(prev => prev.filter(s => s.id !== shareId));
        }},
      ]
    );
  }

  async function handleCancelInvite(inviteId, code) {
    Alert.alert(
      'Cancel invite?',
      `Cancel code ${code}? The recipient won't be able to use it.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel invite', style: 'destructive', onPress: async () => {
          const result = await cancelInvite(inviteId);
          if (result.error) {
            Alert.alert('Error', `Could not cancel: ${result.error}`);
            return;
          }
          setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
        }},
      ]
    );
  }

  // ── Permission loader: fetch permission for each member ──
  async function loadMemberPermissions() {
    if (!members || members.length === 0) return;
    const perms = {};
    for (const m of members) {
      perms[m.id] = await getMyPermissionForMember(m.id);
    }
    setMemberPermissions(perms);
  }

  useEffect(() => { loadHomeData(); }, [activeMember]);
useEffect(() => { loadMemberPermissions(); }, [members]);
useEffect(() => {
    if (!activeMember?.id) {
      setPermission('owner');
      return;
    }
    const perm = memberPermissions[activeMember.id];
    setPermission(perm || 'owner');
  }, [activeMember, memberPermissions]);
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
async function handleAcceptInvite() {
  if (!acceptCode || acceptCode.trim().length < 6) {
    Alert.alert('Code required', 'Please enter the invite code.');
    return;
  }
  setAcceptLoading(true);
  const result = await acceptInvite(acceptCode);
  setAcceptLoading(false);
  
  if (result.error) {
    const errorMessages = {
      not_found: 'Code not found or already used.',
      phone_mismatch: 'This invite was for a different phone number.',
      expired: 'This invite has expired.',
      self_invite: "You can't accept your own invite.",
    };
    Alert.alert('Error', errorMessages[result.error] || `Could not accept: ${result.error}`);
    return;
  }
  
  // Success — pull the newly shared member into local
  Alert.alert('✅ Success', 'Access granted! Pulling latest data...');
  setShowAcceptModal(false);
  setAcceptCode('');
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    await pullAllForUser(session.user.id);
    // Tell parent to refresh
    if (typeof onUpdateMembers === 'function') {
      const updatedMembers = JSON.parse(await AsyncStorage.getItem('members') || '[]');
      onUpdateMembers(updatedMembers);
    }
  }
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
   <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={fm.memberName}>{m.name}</Text>
                      {memberPermissions[m.id] && memberPermissions[m.id] !== 'owner' && (
                        <View style={fm.permBadge}>
                          <Text style={fm.permBadgeText}>
                            {memberPermissions[m.id] === 'view'  && '👁️ View'}
                            {memberPermissions[m.id] === 'edit'  && '✏️ Edit'}
                            {memberPermissions[m.id] === 'admin' && '💪 Admin'}
                          </Text>
                        </View>
                      )}
                    </View>
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
<TouchableOpacity
  style={fm.shareBtn}
  onPress={() => { setShareModalFor(m); }}
>
  <Text style={fm.shareBtnText}>📤</Text>
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
<TouchableOpacity
  style={[fm.addBtn, { borderColor: '#9CA3AF', marginTop: 8 }]}
  onPress={() => { setShowFamilyMgr(false); setShowAcceptModal(true); }}
  activeOpacity={0.8}
>
  <Text style={fm.addBtnIcon}>🔗</Text>
  <Text style={[fm.addBtnText, { color: '#374151' }]}>Have an invite code?</Text>
</TouchableOpacity>

<TouchableOpacity
                style={[fm.addBtn, { borderColor: '#9CA3AF', marginTop: 8 }]}
                onPress={openManageShares}
                activeOpacity={0.8}
              >
                <Text style={fm.addBtnIcon}>⚙️</Text>
                <Text style={[fm.addBtnText, { color: '#374151' }]}>Manage sharing</Text>
              </TouchableOpacity>

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
{/* ── Share Modal ── */}
      <Modal visible={!!shareModalFor} animationType="slide" transparent onRequestClose={handleCloseShareModal}>
        <View style={sm.overlay}>
          <View style={sm.sheet}>
            <View style={sm.handle} />
            <View style={sm.header}>
              <Text style={sm.title}>
                {shareCode ? '✅ Invite Created' : `Share ${shareModalFor?.name || ''}'s Records`}
              </Text>
              <TouchableOpacity style={sm.closeBtn} onPress={handleCloseShareModal}>
                <Text style={sm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {!shareCode ? (
              <View style={sm.body}>
                <Text style={sm.label}>Invitee's phone number</Text>
                <TextInput
                  style={sm.input}
                  placeholder="+91 9876543210"
                  placeholderTextColor="#9CA3AF"
                  value={sharePhone}
                  onChangeText={setSharePhone}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
                <Text style={sm.hint}>Include country code (e.g., +91 for India)</Text>

                <Text style={[sm.label, { marginTop: 16 }]}>Permission level</Text>
                {[
                  { value: 'view',  label: 'View',  desc: 'Read-only access' },
                  { value: 'edit',  label: 'Edit',  desc: 'Can add and edit records' },
                  { value: 'admin', label: 'Admin', desc: 'Can edit and re-share' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[sm.permRow, sharePermission === opt.value && sm.permRowActive]}
                    onPress={() => setSharePermission(opt.value)}
                  >
                    <View style={[sm.radio, sharePermission === opt.value && sm.radioActive]}>
                      {sharePermission === opt.value && <View style={sm.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={sm.permLabel}>{opt.label}</Text>
                      <Text style={sm.permDesc}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[sm.primaryBtn, shareGenerating && { opacity: 0.6 }]}
                  onPress={handleGenerateInvite}
                  disabled={shareGenerating}
                >
                  {shareGenerating ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={sm.primaryBtnText}>Generate Invite Code</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={sm.body}>
                <Text style={sm.codeHint}>Share this code with the invitee:</Text>
                <View style={sm.codeBox}>
                  <Text style={sm.codeText}>{shareCode}</Text>
                </View>
                <Text style={sm.codeExpiry}>Code expires in 7 days</Text>

                <TouchableOpacity style={sm.primaryBtn} onPress={handleShareViaWhatsApp}>
                  <Text style={sm.primaryBtnText}>📤 Share via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={sm.secondaryBtn}
                  onPress={() => Alert.alert('Code copied', `${shareCode}\n\n(Long-press to copy from clipboard)`)}
                >
                  <Text style={sm.secondaryBtnText}>Copy Code</Text>
                </TouchableOpacity>

                <TouchableOpacity style={sm.doneBtn} onPress={handleCloseShareModal}>
                  <Text style={sm.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
{/* ── Accept Invite Modal ── */}
      <Modal visible={showAcceptModal} animationType="slide" transparent onRequestClose={() => setShowAcceptModal(false)}>
        <View style={sm.overlay}>
          <View style={sm.sheet}>
            <View style={sm.handle} />
            <View style={sm.header}>
              <Text style={sm.title}>Enter Invite Code</Text>
              <TouchableOpacity style={sm.closeBtn} onPress={() => { setShowAcceptModal(false); setAcceptCode(''); }}>
                <Text style={sm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={sm.body}>
              <Text style={sm.label}>Invite code</Text>
              <TextInput
                style={[sm.input, { fontSize: 18, letterSpacing: 2, textAlign: 'center', fontWeight: '600' }]}
                placeholder="MR-XXXXXX"
                placeholderTextColor="#9CA3AF"
                value={acceptCode}
                onChangeText={(t) => setAcceptCode(t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={9}
              />
              <Text style={sm.hint}>Paste the code someone shared with you on WhatsApp.</Text>

              <TouchableOpacity
                style={[sm.primaryBtn, acceptLoading && { opacity: 0.6 }]}
                onPress={handleAcceptInvite}
                disabled={acceptLoading}
              >
                {acceptLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={sm.primaryBtnText}>Accept Invite</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={sm.doneBtn} onPress={() => { setShowAcceptModal(false); setAcceptCode(''); }}>
                <Text style={sm.doneBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
{/* ── Manage Shares Modal ── */}
      <Modal visible={showManageModal} animationType="slide" transparent onRequestClose={() => setShowManageModal(false)}>
        <View style={sm.overlay}>
          <View style={[sm.sheet, { maxHeight: '90%' }]}>
            <View style={sm.handle} />
            <View style={sm.header}>
              <Text style={sm.title}>Sharing</Text>
              <TouchableOpacity style={sm.closeBtn} onPress={() => setShowManageModal(false)}>
                <Text style={sm.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {manageLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color="#0B8FAC" />
                <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading shares...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 600 }}>

                {/* Section 1: Shares I've granted */}
                <Text style={ms.sectionTitle}>MEMBERS I'VE SHARED</Text>
                {grantedShares.length === 0 ? (
                  <Text style={ms.emptyText}>You haven't shared any members yet.</Text>
                ) : (
                  grantedShares.map(share => {
                    const member = members.find(m => m.id === share.member_id);
                    return (
                      <View key={share.id} style={ms.card}>
                        <View style={{ flex: 1 }}>
                          <Text style={ms.cardTitle}>
                            {member?.name || 'Unknown member'} · {share.permission}
                          </Text>
                          <Text style={ms.cardSub}>
                            Accepted {share.accepted_at ? new Date(share.accepted_at).toLocaleDateString() : '—'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={ms.revokeBtn}
                          onPress={() => handleRevokeShare(share.id, member?.name)}
                        >
                          <Text style={ms.revokeBtnText}>Revoke</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}

                {/* Section 2: Pending invites */}
                <Text style={[ms.sectionTitle, { marginTop: 20 }]}>PENDING INVITES</Text>
                {pendingInvites.length === 0 ? (
                  <Text style={ms.emptyText}>No pending invites.</Text>
                ) : (
                  pendingInvites.map(inv => {
                    const member = members.find(m => m.id === inv.member_id);
                    const expiresIn = inv.expires_at
                      ? Math.max(0, Math.ceil((new Date(inv.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
                      : null;
                    return (
                      <View key={inv.id} style={ms.card}>
                        <View style={{ flex: 1 }}>
                          <Text style={ms.cardTitle}>
                            Code: {inv.token}
                          </Text>
                          <Text style={ms.cardSub}>
                            For: +{inv.invite_phone} · {inv.permission}
                            {expiresIn !== null && ` · expires in ${expiresIn} day${expiresIn !== 1 ? 's' : ''}`}
                          </Text>
                          <Text style={ms.cardSub}>
                            Member: {member?.name || 'Unknown'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={ms.cancelBtn}
                          onPress={() => handleCancelInvite(inv.id, inv.token)}
                        >
                          <Text style={ms.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}

                {/* Section 3: Shared with me */}
                <Text style={[ms.sectionTitle, { marginTop: 20 }]}>SHARED WITH ME</Text>
                {sharesWithMe.length === 0 ? (
                  <Text style={ms.emptyText}>No one has shared records with you yet.</Text>
                ) : (
                  sharesWithMe.map(share => (
                    <View key={share.id} style={ms.card}>
                      <View style={{ flex: 1 }}>
                        <Text style={ms.cardTitle}>
                          {share.family_members?.name || 'Shared member'} · {share.permission}
                        </Text>
                        <Text style={ms.cardSub}>
                          Accepted {share.accepted_at ? new Date(share.accepted_at).toLocaleDateString() : '—'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}

                <View style={{ height: 20 }} />
              </ScrollView>
            )}
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
  shareBtn:        { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6 },
  shareBtnText:    { fontSize: 16 },
  addBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginTop: 8, borderWidth: 2, borderColor: TEAL, borderStyle: 'dashed', gap: 10 },
  addBtnIcon:      { fontSize: 20 },
  addBtnText:      { fontSize: 15, fontWeight: '700', color: TEAL },
permBadge:       { backgroundColor: TEAL_LT, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  permBadgeText:   { fontSize: 11, fontWeight: '600', color: TEAL },
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
const sm = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:          { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, maxHeight: '85%' },
  handle:         { width: 40, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title:          { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1 },
  closeBtn:       { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:   { fontSize: 18, color: '#6B7280' },
  body:           { paddingBottom: 8 },
  label:          { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:          { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  hint:           { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  permRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: 'transparent' },
  permRowActive:  { borderColor: TEAL, backgroundColor: TEAL_LT },
  radio:          { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  radioActive:    { borderColor: TEAL },
  radioDot:       { width: 10, height: 10, borderRadius: 5, backgroundColor: TEAL },
  permLabel:      { fontSize: 15, fontWeight: '600', color: '#111827' },
  permDesc:       { fontSize: 12, color: '#6B7280', marginTop: 2 },
  primaryBtn:     { backgroundColor: TEAL, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn:   { backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryBtnText:{ fontSize: 15, fontWeight: '600', color: '#374151' },
  doneBtn:        { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  doneBtnText:    { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  codeHint:       { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 12 },
  codeBox:        { backgroundColor: TEAL_LT, borderRadius: 12, paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', borderWidth: 2, borderColor: TEAL, borderStyle: 'dashed' },
  codeText:       { fontSize: 28, fontWeight: '700', color: TEAL, letterSpacing: 2 },
  codeExpiry:     { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
});
const ms = StyleSheet.create({
  sectionTitle:    { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginTop: 4, marginBottom: 10 },
  emptyText:       { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', paddingVertical: 8 },
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle:       { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  cardSub:         { fontSize: 12, color: '#6B7280' },
  revokeBtn:       { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  revokeBtnText:   { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  cancelBtn:       { backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  cancelBtnText:   { fontSize: 12, fontWeight: '700', color: '#D97706' },
});