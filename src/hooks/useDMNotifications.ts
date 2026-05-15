import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import type { DMMessage } from '../types';

type PermissionState = NotificationPermission | 'unsupported';

export function useDMNotifications(myUid: string | null, currentDMOtherUid: string | null) {
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [notifPermission, setNotifPermission] = useState<PermissionState>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const threadToOtherRef = useRef<Map<string, string>>(new Map());
  const currentDMOtherUidRef = useRef<string | null>(currentDMOtherUid);
  const displayNameCacheRef = useRef<Map<string, string>>(new Map());
  const myUidRef = useRef<string | null>(myUid);

  useEffect(() => {
    currentDMOtherUidRef.current = currentDMOtherUid;
  }, [currentDMOtherUid]);

  useEffect(() => {
    myUidRef.current = myUid;
  }, [myUid]);

  const ensureThreadMapped = useCallback(async (threadId: string): Promise<string | null> => {
    const cached = threadToOtherRef.current.get(threadId);
    if (cached) return cached;
    const me = myUidRef.current;
    if (!me) return null;
    const { data, error } = await supabase
      .from('dm_threads')
      .select('user_a_id, user_b_id')
      .eq('id', threadId)
      .single();
    if (error || !data) return null;
    const otherUid = data.user_a_id === me ? data.user_b_id : data.user_a_id;
    threadToOtherRef.current.set(threadId, otherUid);
    return otherUid;
  }, []);

  const fetchDisplayName = useCallback(async (otherUid: string): Promise<string> => {
    const cached = displayNameCacheRef.current.get(otherUid);
    if (cached) return cached;
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', otherUid)
      .single();
    const name = (data?.display_name as string | undefined) ?? 'Usuario';
    displayNameCacheRef.current.set(otherUid, name);
    return name;
  }, []);

  const maybeShowBrowserNotification = useCallback(
    async (otherUid: string, body: string) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const isViewingFocused =
        currentDMOtherUidRef.current === otherUid && document.hasFocus();
      if (isViewingFocused) return;
      const displayName = await fetchDisplayName(otherUid);
      try {
        new Notification(displayName, {
          body: body.slice(0, 100),
          icon: '/favicon.ico',
          tag: `dm-${otherUid}`,
        });
      } catch (err) {
        console.warn('No se pudo mostrar la notificación:', err);
      }
    },
    [fetchDisplayName]
  );

  // Subscribe to dm_messages INSERT for messages addressed to me.
  useEffect(() => {
    if (!myUid) return;

    // Preload thread map
    (async () => {
      const { data } = await supabase
        .from('dm_threads')
        .select('id, user_a_id, user_b_id')
        .or(`user_a_id.eq.${myUid},user_b_id.eq.${myUid}`);
      if (data) {
        for (const t of data) {
          const otherUid = t.user_a_id === myUid ? t.user_b_id : t.user_a_id;
          threadToOtherRef.current.set(t.id as string, otherUid as string);
        }
      }
    })();

    const ch = supabase
      .channel(`dm-notifs-${myUid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `sender_id=neq.${myUid}`,
        },
        async (payload) => {
          const msg = payload.new as DMMessage;
          const otherUid = await ensureThreadMapped(msg.thread_id);
          if (!otherUid) return;
          const isViewing =
            currentDMOtherUidRef.current === otherUid && document.hasFocus();
          if (isViewing) return;
          setUnread((prev) => {
            const next = new Map(prev);
            next.set(otherUid, (prev.get(otherUid) ?? 0) + 1);
            return next;
          });
          maybeShowBrowserNotification(otherUid, msg.body);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      threadToOtherRef.current.clear();
    };
  }, [myUid, ensureThreadMapped, maybeShowBrowserNotification]);

  const markRead = useCallback((otherUid: string) => {
    setUnread((prev) => {
      if (!prev.has(otherUid)) return prev;
      const next = new Map(prev);
      next.delete(otherUid);
      return next;
    });
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }, []);

  const totalUnread = useMemo(() => {
    let sum = 0;
    for (const v of unread.values()) sum += v;
    return sum;
  }, [unread]);

  return {
    unreadByOther: unread,
    totalUnread,
    markRead,
    notifPermission,
    requestNotificationPermission,
  };
}
