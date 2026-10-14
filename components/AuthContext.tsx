
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, api, isLocalMode } from '../lib/supabase';
import type { UserProfile } from '../types';
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

function sessionId(session: Session): string | null {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload));
    return typeof claims.session_id === 'string' && claims.session_id ? claims.session_id : null;
  } catch {
    return null;
  }
}

// This comparison only chooses the loading UI; authorization is checked on the server.
function sameLogin(previous: Session, next: Session): boolean {
  if (previous.user.id !== next.user.id) return false;
  if (previous.access_token === next.access_token) return true;
  const previousId = sessionId(previous);
  return previousId !== null && previousId === sessionId(next);
}

async function fetchProfile(userId: string, isCurrent: () => boolean, blockForInspection: () => void): Promise<UserProfile | null> {
  const lockInspection = () => {
    if (!isInspectionModeActive()) blockForInspection();
    localStorage.setItem('_ilm', '1');
  };
  try {
    if (!isLocalMode) {
      const vault = await offlineDb.getInspectionVault();
      if (!isCurrent()) return null;
      if (vault) lockInspection();
      const serverLocked = await api.getInspectionSessionState();
      if (!isCurrent()) return null;
      if (serverLocked) lockInspection();
      if (isInspectionModeActive()) {
        const minimalProfile = await api.getInspectionProfile();
        if (!isCurrent() || minimalProfile?.id !== userId) return null;
        if (minimalProfile.role === 'admin' && minimalProfile.is_approved) {
          const { sealInspectionLocalData } = await import('../lib/inspectionLocalVault');
          if (!isCurrent()) return null;
          await sealInspectionLocalData();
        }
        if (!isCurrent()) return null;
        await offlineDb.saveValue(`inspection:v1:${userId}:profile`, minimalProfile);
        return minimalProfile;
      }
    }
    if (!isCurrent()) return null;
    const query = isInspectionModeActive()
      ? supabase.from('profiles').select('id,full_name,email,role,is_approved')
      : supabase.from('profiles').select('*');
    const { data, error } = await query.eq('id', userId).single();
    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data?.id === userId ? data as UserProfile : null;
  } catch (err) {
    if (!isCurrent()) return null;
    console.error(err);
    if (isInspectionModeActive() && !(err instanceof Error && err.name === 'InspectionSealError')) {
      const cached = await offlineDb.getValue<UserProfile>(`inspection:v1:${userId}:profile`);
      return cached?.id === userId ? cached : null;
    }
    return null;
  }
}

export const AuthProvider = ({ children }: { children?: React.ReactNode }) => {
  // Publish these together: an authenticated session must not render an error
  // while its profile and inspection access checks are still pending.
  const [{ session, profile, loading }, setAuthState] = useState({
    session: null as Session | null,
    profile: null as UserProfile | null,
    loading: true,
  });
  const mounted = useRef(false);
  const activeSession = useRef<Session | null>(null);
  const verifiedAccess = useRef<{ session: Session; profile: UserProfile; inspection: boolean } | null>(null);
  const profileRequest = useRef(0);
  const pendingProfile = useRef<{
    userId: string; token: string; request: number; promise: Promise<void>;
  } | null>(null);

  const loadProfile = useCallback((nextSession: Session, defer = false): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    const pending = pendingProfile.current;
    if (pending?.userId === nextSession.user.id && pending.token === nextSession.access_token) {
      return pending.promise;
    }

    // Reserve ownership before deferring, so sign-out or a newer session can
    // invalidate the callback even before it starts its first RPC.
    const request = ++profileRequest.current;
    const isCurrent = () => mounted.current && request === profileRequest.current;
    const verified = verifiedAccess.current;
    const keepWorkspace = verified && sameLogin(verified.session, nextSession)
      && verified.inspection === isInspectionModeActive();
    if (!keepWorkspace) verifiedAccess.current = null;
    setAuthState({ session: nextSession, profile: keepWorkspace ? verified.profile : null, loading: !keepWorkspace });
    const blockForInspection = () => {
      if (!isCurrent()) return;
      verifiedAccess.current = null;
      setAuthState({ session: nextSession, profile: null, loading: true });
    };
    const promise = (async () => {
      // Supabase holds an auth lock inside onAuthStateChange. Start RPCs afterward.
      if (defer) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent()) return;
      let nextProfile: UserProfile | null = null;
      try {
        nextProfile = await fetchProfile(nextSession.user.id, isCurrent, blockForInspection);
      } catch (error) {
        // A failed offline-cache read must also settle startup, without granting access.
        if (isCurrent()) console.error('Error loading profile:', error);
      }
      if (isCurrent()) {
        verifiedAccess.current = nextProfile
          ? { session: activeSession.current!, profile: nextProfile, inspection: isInspectionModeActive() }
          : null;
        setAuthState({ session: activeSession.current, profile: nextProfile, loading: false });
      }
    })();
    pendingProfile.current = { userId: nextSession.user.id, token: nextSession.access_token, request, promise };
    void promise.then(() => {
      if (pendingProfile.current?.request === request) pendingProfile.current = null;
    });
    return promise;
  }, []);

  const applySession = useCallback((nextSession: Session | null, defer = false, forceProfileCheck = false) => {
    if (!mounted.current) return;
    activeSession.current = nextSession;
    setInspectionQueryOwner(nextSession?.user?.id || null);
    if (nextSession?.user) {
      const verified = verifiedAccess.current;
      // Supabase also emits SIGNED_IN when confirming a session on tab focus.
      // An unchanged, already checked token should not remount the application.
      if (!forceProfileCheck && !pendingProfile.current && verified
        && verified.session.user.id === nextSession.user.id
        && verified.session.access_token === nextSession.access_token
        && verified.inspection === isInspectionModeActive()) {
        verifiedAccess.current = { ...verified, session: nextSession };
        setAuthState({ session: nextSession, profile: verified.profile, loading: false });
        return;
      }
      void loadProfile(nextSession, defer);
    } else {
      profileRequest.current += 1;
      pendingProfile.current = null;
      verifiedAccess.current = null;
      setAuthState({ session: null, profile: null, loading: false });
    }
  }, [loadProfile]);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let receivedAuthEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (disposed) return;
      receivedAuthEvent = true;
      applySession(nextSession, true, event === 'USER_UPDATED');
    });

    void supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      // Auth events are newer than this bootstrap read, including sign-out.
      if (disposed || receivedAuthEvent) return;
      if (error) console.error('Error reading session:', error);
      applySession(error ? null : initialSession);
    }).catch((error) => {
      if (disposed || receivedAuthEvent) return;
      console.error('Error reading session:', error);
      applySession(null);
    });

    return () => {
      disposed = true;
      mounted.current = false;
      profileRequest.current += 1;
      pendingProfile.current = null;
      verifiedAccess.current = null;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    applySession(null);
  };

  const refreshProfile = async () => {
    if (activeSession.current?.user) await loadProfile(activeSession.current);
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
