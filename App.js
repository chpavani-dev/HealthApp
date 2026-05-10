import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen          from './screens/HomeScreen';
import ReportsScreen       from './screens/ReportsScreen';
import PrescriptionsScreen from './screens/PrescriptionsScreen';
import TimelineScreen      from './screens/TimelineScreen';
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
  { name: 'Home',          icon: '🏠' },
  { name: 'Reports',       icon: '📋' },
  { name: 'Prescriptions', icon: '💊' },
  { name: 'Timeline',      icon: '📈' },
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
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: styles.tabBar,
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function App() {
  const [loading, setLoading]           = useState(true);
  const [user, setUser]                 = useState(null);
  const [members, setMembers]           = useState([]);
  const [activeMember, setActiveMember] = useState(null);

  useEffect(() => {
    loadSavedData();
  }, []);

  async function loadSavedData() {
    try {
      const savedUser    = await AsyncStorage.getItem('user');
      const savedMembers = await AsyncStorage.getItem('members');
      const savedActive  = await AsyncStorage.getItem('activeMember');
      if (savedUser)    setUser(JSON.parse(savedUser));
      if (savedMembers) setMembers(JSON.parse(savedMembers));
      if (savedActive)  setActiveMember(JSON.parse(savedActive));
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
    await AsyncStorage.setItem('activeMember', JSON.stringify(active));
  }

  async function handleSwitchMember(member) {
    setActiveMember(member);
    await AsyncStorage.setItem('activeMember', JSON.stringify(member));
  }

  async function handleLogout() {
    await AsyncStorage.multiRemove(['user', 'members', 'activeMember']);
    setUser(null); setMembers([]); setActiveMember(null);
  }

  async function handleUpdateMembers(allMembers) {
    setMembers(allMembers);
    await AsyncStorage.setItem('members', JSON.stringify(allMembers));
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingEmoji}>🏥</Text>
        <Text style={styles.loadingText}>MedRecord</Text>
        <ActivityIndicator color="#0B8FAC" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!user) {
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
    <MainApp
      members={members}
      activeMember={activeMember}
      onSwitchMember={handleSwitchMember}
      onLogout={handleLogout}
      onUpdateMembers={handleUpdateMembers}
    />
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
  loadingEmoji: { fontSize: 52, marginBottom: 12 },
  loadingText:  { fontSize: 24, fontWeight: '800', color: '#0B8FAC' },
});

registerRootComponent(Sentry.wrap(App));