import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { registerRootComponent } from 'expo';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './AuthContext';
import { PermissionProvider } from './PermissionContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import SupabaseLoginScreen      from './screens/SupabaseLoginScreen';
import OTPScreen                from './screens/OTPScreen';
import { pullAllForUser, pushFamilyMember } from './cloudSync';
import HomeScreen          from './screens/HomeScreen';
import ReportsScreen       from './screens/ReportsScreen';
import PrescriptionsScreen from './screens/PrescriptionsScreen';
import TimelineScreen      from './screens/TimelineScreen';
import NotesScreen          from './screens/NotesScreen';
import LoginScreen         from './screens/LoginScreen';
import ProfileScreen       from './screens/ProfileScreen';
import * as Sentry from '@sentry/react-native';


Sentry.init({
  dsn: 'https://a586fb5f3137cce8f5c23a3c45f91469@o4511360693633024.ingest.us.sentry.io/4511360719912960',
  
  release: 'medrecord@1.6.0', 
  
  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Home',          label: 'Home',        icon: '🏠' },
  { name: 'Reports',       label: 'Lab Reports', icon: '📋' },
  { name: 'Prescriptions', label: 'My Meds',     icon: '💊' },
  { name: 'Timeline',      label: 'Lab Trends',  icon: '📈' },
  { name: 'Notes',         label: 'Notes',       icon: '📝' },
];

function TabIcon({ name, focused }) {
  const tab = TABS.find(t => t.name === name);
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={styles.iconEmoji}>{tab.icon}</Text>
    </View>
  );
}
function MainApp({ members, activeMember, onSwitchMember, onLogout, onUpdateMembers }) {
  const insets = useSafeAreaInsets();
  return ( 
   <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: [
            styles.tabBar,
            {
              paddingBottom: insets.bottom + 8,
              height: 60 + insets.bottom,
            },
          ],
          tabBarActiveTintColor: '#0B8FAC',
          tabBarInactiveTintColor: '#9CA3AF',

          tabBarIcon: ({ focused }) => (
            <TabIcon name={route.name} focused={focused} />

          ),
        })}
      >
        <Tab.Screen name="Home">
          {(props) => (
            <HomeScreen
              {...props}
              members={members}
              activeMember={activeMember}
              onSwitchMember={onSwitchMember}
              onLogout={onLogout}
              onUpdateMembers={onUpdateMembers}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Reports">
          {(props) => <ReportsScreen {...props} activeMember={activeMember} />}
        </Tab.Screen>
        <Tab.Screen name="Prescriptions">
          {(props) => <PrescriptionsScreen {...props} activeMember={activeMember} />}
        </Tab.Screen>
        <Tab.Screen name="Timeline">
          {(props) => <TimelineScreen {...props} activeMember={activeMember} />}
        </Tab.Screen>
       <Tab.Screen name="Notes">
          {(props) => <NotesScreen {...props} activeMember={activeMember} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function AppInner() {
  const [loading, setLoading]           = useState(true);
  const [user, setUser]                 = useState(null);
  const [members, setMembers]           = useState([]);
  const [activeMember, setActiveMember] = useState(null);
const [authStep, setAuthStep]   = useState('login');  // 'login' | 'otp'
  const [authPhone, setAuthPhone] = useState('');
  const { session: supabaseSession, signOut: supabaseSignOut } = useAuth();

  useEffect(() => {
    loadSavedData();
  }, []);
// Bridge: when Supabase session arrives, populate existing user state
  // so the rest of the app (ProfileScreen, MainApp) works unchanged.
  useEffect(() => {
    if (supabaseSession?.user && !user) {
      const supaUser = supabaseSession.user;
      const bridgedUser = {
        id: supaUser.id,
        phone: supaUser.phone,
        supabaseId: supaUser.id,
      };
      setUser(bridgedUser);
      AsyncStorage.setItem('user', JSON.stringify(bridgedUser));
pullAllForUser(supaUser.id).then(() => loadSavedData()).catch(() => {});
    }
  }, [supabaseSession]);

  async function loadSavedData() {
    try {
      const savedUser    = await AsyncStorage.getItem('user');
      const savedMembers = await AsyncStorage.getItem('members');
      const savedActive  = await AsyncStorage.getItem('activeMember');
      if (savedUser)    setUser(JSON.parse(savedUser));
      
      const parsedMembers = savedMembers ? JSON.parse(savedMembers) : [];
      if (parsedMembers.length > 0) setMembers(parsedMembers);
      
      if (savedActive) {
        setActiveMember(JSON.parse(savedActive));
      } else if (parsedMembers.length > 0) {
        // Auto-select first member if none selected (prevents 'default' bucket bug)
        const firstMember = parsedMembers[0];
        setActiveMember(firstMember);
        await AsyncStorage.setItem('activeMember', JSON.stringify(firstMember));
      }
    } catch (e) {
      console.log('Load error:', e);
    }
    setLoading(false);
  }

  async function handleLogin(userData) {
    setUser(userData);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
  }

  async function handleProfileComplete(allMembers, active) {
    setMembers(allMembers);
    setActiveMember(active);
    await AsyncStorage.setItem('members', JSON.stringify(allMembers));
for (const m of allMembers) pushFamilyMember(m).catch(() => {});
    await AsyncStorage.setItem('activeMember', JSON.stringify(active));
  }

  async function handleSwitchMember(member) {
    setActiveMember(member);
    await AsyncStorage.setItem('activeMember', JSON.stringify(member));
  }

async function handleLogout() {
    await supabaseSignOut();   // sign out from Supabase too
    await AsyncStorage.multiRemove(['user', 'members', 'activeMember']);
    setUser(null); setMembers([]); setActiveMember(null);
    setAuthStep('login');
    setAuthPhone('');
  }

  async function handleUpdateMembers(allMembers) {
    setMembers(allMembers);
    await AsyncStorage.setItem('members', JSON.stringify(allMembers));
for (const m of allMembers) pushFamilyMember(m).catch(() => {});
  }

  if (loading) {
    return (
  <View style={styles.loadingWrap}>
        <Image
          source={require('./assets/branding/horizontal/vitalynx-logo-horizontal-400.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <ActivityIndicator color="#0B8FAC" style={{ marginTop: 24 }} />
      </View>
    );
  }

 if (!user) {
    // Feature flag — set to false to use the old LoginScreen during transition
    const USE_SUPABASE_AUTH = true;

    if (USE_SUPABASE_AUTH) {
      if (authStep === 'login') {
        return (
          <SupabaseLoginScreen
            onCodeSent={(phoneE164) => {
              setAuthPhone(phoneE164);
              setAuthStep('otp');
            }}
          />
        );
      }
      return (
        <OTPScreen
          phone={authPhone}
          onChangeNumber={() => setAuthStep('login')}
        />
      );
    }

    // Fallback: old LoginScreen (kept temporarily for safety)
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (members.length === 0) {
    return (
      <ProfileScreen
        onProfileComplete={handleProfileComplete}
        existingMembers={[]}
      />
    );
  }

  return (
<PermissionProvider>
    <MainApp
      members={members}
      activeMember={activeMember}
      onSwitchMember={handleSwitchMember}
      onLogout={handleLogout}
      onUpdateMembers={handleUpdateMembers}
    />
</PermissionProvider>
  );
}
// New wrapper that provides AuthContext to the entire app
function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabLabel:     { fontSize: 10, fontWeight: '600', marginTop: 2 },
  iconWrap:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: '#E8F7FA' },
  iconEmoji:    { fontSize: 20 },
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },
 loadingLogo:  { width: 240, height: 80, marginBottom: 8 },
});

registerRootComponent(Sentry.wrap(App));