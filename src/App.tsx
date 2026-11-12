import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import CallRoom from './components/CallRoom';
import Profile from './components/Profile';
import DMWindow from './components/DMWindow';
import { useDMNotifications } from './hooks/useDMNotifications';
import { useFriends } from './hooks/useFriends';
import { UserProfile, FriendWithProfile } from './types';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import Medidor from './components/ui/Medidor';

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

/** Movimiento: respeta prefers-reduced-motion en todo lo que anima `motion`. */
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppContenido />
    </MotionConfig>
  );
}

function AppContenido() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentDM, setCurrentDM] = useState<FriendWithProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    unreadByOther,
    totalUnread,
    markRead,
    notifPermission,
    requestNotificationPermission,
  } = useDMNotifications(
    userProfile?.uid ?? null,
    currentDM?.otherUid ?? null
  );

  const friendsApi = useFriends(userProfile?.uid ?? null);

  useEffect(() => {
    if (currentDM) markRead(currentDM.otherUid);
  }, [currentDM, markRead]);

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
      <div role="status" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-fondo">
        <div className="brand-kallit text-marca-movil">
          <span>Kall</span>
          <span className="brand-it">It</span>
        </div>
        <Medidor carga />
        <p className="text-texto-secundario">Cargando…</p>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-fondo text-texto">
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
              friends={friendsApi.friends}
              sent={friendsApi.sent}
              sendFriendRequest={friendsApi.sendRequest}
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
              onStartDM={(friend) => setCurrentDM(friend)}
              unreadByOther={unreadByOther}
              totalUnread={totalUnread}
              notifPermission={notifPermission}
              requestNotificationPermission={requestNotificationPermission}
              friendsApi={friendsApi}
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

      <AnimatePresence>
        {!currentCallId && currentDM && (
          <DMWindow
            myUid={userProfile.uid}
            friend={currentDM}
            onClose={() => setCurrentDM(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
