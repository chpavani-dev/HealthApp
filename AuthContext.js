// ====================================================================
// AuthContext — global auth state for the app
// ====================================================================
//
// Wrap the root of App.js with <AuthProvider>:
//
//   import { AuthProvider } from './AuthContext';
//
//   export default function App() {
//     return (
//       <AuthProvider>
//         <YourMainApp />
//       </AuthProvider>
//     );
//   }
//
// Then anywhere in your app, use the hook:
//
//   import { useAuth } from './AuthContext';
//
//   function SomeScreen() {
//     const { user, session, loading, signInWithPhone, verifyOtp, signOut } = useAuth();
//     ...
//   }
//
// AuthContext exposes:
//   user             — Supabase user object (with id, phone) or null
//   session          — full Supabase session with tokens or null
//   loading          — true while we're checking initial session at app start
//   signInWithPhone  — async (phoneE164) => { error }
//   verifyOtp        — async (phoneE164, code) => { error }
//   signOut          — async () => { error }
// ====================================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signInWithPhone: async () => ({ error: 'AuthProvider missing' }),
  verifyOtp:       async () => ({ error: 'AuthProvider missing' }),
  signOut:         async () => ({ error: 'AuthProvider missing' }),
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // ---- Initial session check on app start ----
  // If user logged in previously, Supabase has saved their session in
  // AsyncStorage. getSession() reads it.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!mounted) return;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
    }).catch(err => {
      console.log('AuthContext: getSession error', err);
      if (mounted) setLoading(false);
    });

    // Subscribe to all future auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // ---- Send OTP to phone ----
  // phoneE164: '+919876543210' format
  // Returns { error } — error is null on success
  const signInWithPhone = async (phoneE164) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
    });
    return { error };
  };

  // ---- Verify the OTP code user typed ----
  // Returns { error, user } — error null on success
  const verifyOtp = async (phoneE164, code) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: code,
      type: 'sms',
    });
    // The onAuthStateChange subscription above will pick up the new session
    // automatically, so we don't need to setSession here.
    return { error, user: data?.user };
  };

  // ---- Sign out (clears tokens + session) ----
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const value = {
    user,
    session,
    loading,
    signInWithPhone,
    verifyOtp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook for screens to consume auth state
export function useAuth() {
  return useContext(AuthContext);
}
