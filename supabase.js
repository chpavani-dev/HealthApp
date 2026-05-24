// ====================================================================
// Supabase client — used everywhere in the app
// ====================================================================
//
// Imports:
//   import { supabase } from './supabase';
//
// Usage examples:
//   await supabase.auth.signInWithOtp({ phone: '+919876543210' });
//   await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
//   await supabase.auth.signOut();
//   const { data: { session } } = await supabase.auth.getSession();
//
// Configuration is read from .env (EXPO_PUBLIC_* variables).
// ====================================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast in dev so we catch missing env vars immediately
  console.warn(
    '⚠ Supabase env vars missing. Check .env file:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,            // persist session in AsyncStorage
    autoRefreshToken: true,           // refresh access token before expiry
    persistSession: true,             // keep session across app restarts
    detectSessionInUrl: false,        // RN doesn't have URLs
  },
});
