import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import CallRoom from './components/CallRoom';
import Profile from './components/Profile';
import { UserProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';

function applyTheme(profile: UserProfile) {
  const root = document.documentElement;
  root.className = '';
  if (profile.theme && profile.theme !== 'default') {
    root.classList.add(`theme-${profile.theme}`);
  }
  if (profile.isDarkMode) {
    root.classList.add('dark');
  }
}

function rowToProfile(row: any): UserProfile {
  return {
    uid: row.id,
    displayName: row.display_name,
    photoURL: row.photo_url,
    email: row.email,
    theme: row.theme,
    isDarkMode: row.is_dark_mode,
    avatarConfig: row.avatar_config ?? undefined,
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Error cargando profile:', error);
      setUserProfile(null);
    } else if (data) {
      const profile = rowToProfile(data);
      setUserProfile(profile);
      applyTheme(profile);
    } else {
      setUserProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const handleLogout = () => supabase.auth.signOut();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      <AnimatePresence mode="wait">
        {currentCallId ? (
          <motion.div
            key="call"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CallRoom
              callId={currentCallId}
              userProfile={userProfile}
              onLeave={() => setCurrentCallId(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Dashboard
              userProfile={userProfile}
              onJoinCall={(id) => setCurrentCallId(id)}
              onLogout={handleLogout}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <Profile
            userProfile={userProfile}
            onClose={() => setIsSettingsOpen(false)}
            onProfileUpdated={() => user && loadProfile(user.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
