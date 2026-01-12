
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch profile logic
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      if (session?.user) {
        // If profile is already loaded for this user, don't trigger loading state again
        // unless it's a different user (unlikely in this context but good for safety)
        setProfile((prevProfile) => {
            if (prevProfile?.id === session.user.id) {
                // Profile matches session, just ensure loading is false
                setLoading(false);
                return prevProfile;
            } else {
                // New user or no profile yet: Force loading TRUE and fetch
                setLoading(true);
                fetchProfile(session.user.id).finally(() => {
                    setLoading(false);
                });
                return null; // Temporarily clear profile while fetching new one
            }
        });
      } else {
        // No user
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
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

  const signIn = async () => {
    // Placeholder
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut, refreshProfile }}>
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
