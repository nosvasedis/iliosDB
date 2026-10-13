
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, api, isLocalMode } from '../lib/supabase';
import { UserProfile } from '../types';
import { isInspectionModeActive } from '../lib/inspectionMode';
import { setInspectionQueryOwner } from '../features/inspection/queryScope';
import { offlineDb } from '../lib/offlineDb';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileRequest = useRef(0);

  // Fetch profile logic
  const fetchProfile = async (userId: string) => {
    const request = ++profileRequest.current;
    const applyProfile = (value: UserProfile | null) => { if (request === profileRequest.current) setProfile(value); };
    try {
      if (!isLocalMode) {
        if (await offlineDb.getInspectionVault()) localStorage.setItem('_ilm', '1');
        const serverLocked = await api.getInspectionSessionState();
        if (serverLocked) localStorage.setItem('_ilm', '1');
        if (isInspectionModeActive()) {
          const minimalProfile = await api.getInspectionProfile();
          if (minimalProfile?.role === 'admin' && minimalProfile.is_approved) {
            const { sealInspectionLocalData } = await import('../lib/inspectionLocalVault');
            await sealInspectionLocalData();
          }
          if (minimalProfile) await offlineDb.saveValue(`inspection:v1:${userId}:profile`, minimalProfile);
          applyProfile(minimalProfile);
          return;
        }
      }
      const query = isInspectionModeActive()
        ? supabase.from('profiles').select('id,full_name,email,role,is_approved')
        : supabase.from('profiles').select('*');
      const { data, error } = await query
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        applyProfile(data as UserProfile);
      }
    } catch (err) {
      console.error(err);
      if (isInspectionModeActive() && !(err instanceof Error && err.name === 'InspectionSealError')) {
        const cached = await offlineDb.getValue<UserProfile>(`inspection:v1:${userId}:profile`);
        applyProfile(cached?.id === userId ? cached : null);
      } else applyProfile(null);
    }
  };

  useEffect(() => {
    // Set initial session immediately so refresh doesn't show login flicker
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setInspectionQueryOwner(initialSession?.user?.id || null);
      setSession(initialSession);
      if (initialSession?.user) {
        setLoading(true);
        fetchProfile(initialSession.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setInspectionQueryOwner(session?.user?.id || null);
      setSession(session);

      if (session?.user) {
        setLoading(true);
        // Supabase holds an auth lock during this callback. Start RPCs afterward.
        setTimeout(() => { void fetchProfile(session.user.id).finally(() => setLoading(false)); }, 0);
      } else {
        profileRequest.current += 1;
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    profileRequest.current += 1;
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      setLoading(true); 
      await fetchProfile(session.user.id);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
