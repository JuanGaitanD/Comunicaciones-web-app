import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import type { Friendship, FriendWithProfile } from '../types';

type Relation = 'none' | 'friends' | 'sent' | 'received' | 'blocked';

export interface SearchResult {
  uid: string;
  displayName: string;
  photoURL: string;
  relation: Relation;
}

export function useFriends(myUid: string | null) {
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [received, setReceived] = useState<FriendWithProfile[]>([]);
  const [sent, setSent] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refetch = useCallback(async () => {
    if (!myUid) return;

    const { data: rows, error: e1 } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_a_id.eq.${myUid},user_b_id.eq.${myUid}`);

    if (e1) {
      console.error('Error cargando friendships:', e1);
      setLoading(false);
      return;
    }

    const friendships = (rows ?? []) as Friendship[];
    const otherIds = friendships.map((r) =>
      r.user_a_id === myUid ? r.user_b_id : r.user_a_id
    );

    if (otherIds.length === 0) {
      setFriends([]);
      setReceived([]);
      setSent([]);
      setLoading(false);
      return;
    }

    const { data: profilesData, error: e2 } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url')
      .in('id', otherIds);

    if (e2) {
      console.error('Error cargando perfiles de amigos:', e2);
      setLoading(false);
      return;
    }

    const profileMap = new Map(
      (profilesData ?? []).map((p) => [
        p.id,
        { displayName: p.display_name as string, photoURL: p.photo_url as string },
      ])
    );

    const enriched: FriendWithProfile[] = friendships.map((f) => {
      const otherUid = f.user_a_id === myUid ? f.user_b_id : f.user_a_id;
      return {
        friendship: f,
        otherUid,
        otherProfile: profileMap.get(otherUid) ?? { displayName: 'Usuario', photoURL: '' },
      };
    });

    setFriends(enriched.filter((e) => e.friendship.status === 'accepted'));
    setReceived(
      enriched.filter(
        (e) => e.friendship.status === 'pending' && e.friendship.requested_by !== myUid
      )
    );
    setSent(
      enriched.filter(
        (e) => e.friendship.status === 'pending' && e.friendship.requested_by === myUid
      )
    );
    setLoading(false);
  }, [myUid]);

  useEffect(() => {
    if (!myUid) return;

    setLoading(true);
    refetch();

    const ch = supabase
      .channel(`my-friendships-${myUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_a_id=eq.${myUid}` },
        () => refetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_b_id=eq.${myUid}` },
        () => refetch()
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [myUid, refetch]);

  const searchUsers = useCallback(
    async (query: string): Promise<SearchResult[]> => {
      if (!myUid || !query.trim()) return [];

      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url')
        .ilike('display_name', `%${query.trim()}%`)
        .neq('id', myUid)
        .limit(8);

      if (!data) return [];

      const allFriendships = [...friends, ...received, ...sent];

      return data.map((p) => {
        const match = allFriendships.find((f) => f.otherUid === p.id);
        let relation: Relation = 'none';
        if (match) {
          if (match.friendship.status === 'accepted') relation = 'friends';
          else if (match.friendship.status === 'blocked') relation = 'blocked';
          else if (match.friendship.requested_by === myUid) relation = 'sent';
          else relation = 'received';
        }
        return {
          uid: p.id as string,
          displayName: p.display_name as string,
          photoURL: p.photo_url as string,
          relation,
        };
      });
    },
    [myUid, friends, received, sent]
  );

  const sendRequest = useCallback(
    async (targetUid: string) => {
      if (!myUid) return;
      const [a, b] = [myUid, targetUid].sort();
      const { error } = await supabase.from('friendships').insert({
        user_a_id: a,
        user_b_id: b,
        requested_by: myUid,
        status: 'pending',
      });
      if (error) throw error;
    },
    [myUid]
  );

  const accept = useCallback(async (f: FriendWithProfile) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_a_id', f.friendship.user_a_id)
      .eq('user_b_id', f.friendship.user_b_id);
    if (error) throw error;
  }, []);

  const reject = useCallback(async (f: FriendWithProfile) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a_id', f.friendship.user_a_id)
      .eq('user_b_id', f.friendship.user_b_id);
    if (error) throw error;
  }, []);

  const cancel = useCallback(async (f: FriendWithProfile) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_a_id', f.friendship.user_a_id)
      .eq('user_b_id', f.friendship.user_b_id);
    if (error) throw error;
  }, []);

  const block = useCallback(async (f: FriendWithProfile) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'blocked' })
      .eq('user_a_id', f.friendship.user_a_id)
      .eq('user_b_id', f.friendship.user_b_id);
    if (error) throw error;
  }, []);

  return { friends, received, sent, loading, searchUsers, sendRequest, accept, reject, cancel, block };
}
