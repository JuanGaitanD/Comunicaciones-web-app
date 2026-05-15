import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { DMThread, DMMessage } from '../types';

export function useDMThread(myUid: string | null, otherUid: string | null) {
  const [thread, setThread] = useState<DMThread | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!myUid || !otherUid) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      const [a, b] = [myUid!, otherUid!].sort();

      let { data: thr, error: e1 } = await supabase
        .from('dm_threads')
        .select('*')
        .eq('user_a_id', a)
        .eq('user_b_id', b)
        .maybeSingle();

      if (e1) {
        if (!cancelled) { setError(e1.message); setLoading(false); }
        return;
      }

      if (!thr) {
        const ins = await supabase
          .from('dm_threads')
          .insert({ user_a_id: a, user_b_id: b })
          .select()
          .single();

        if (ins.error) {
          if (ins.error.code === '23505') {
            const retry = await supabase
              .from('dm_threads')
              .select('*')
              .eq('user_a_id', a)
              .eq('user_b_id', b)
              .single();
            if (retry.error) {
              if (!cancelled) { setError(retry.error.message); setLoading(false); }
              return;
            }
            thr = retry.data;
          } else {
            if (!cancelled) { setError(ins.error.message); setLoading(false); }
            return;
          }
        } else {
          thr = ins.data;
        }
      }

      if (cancelled) return;
      setThread(thr as DMThread);

      const { data: msgs } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('thread_id', (thr as DMThread).id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      setMessages(((msgs ?? []) as DMMessage[]).reverse());
      setLoading(false);

      const ch = supabase
        .channel(`dm:${(thr as DMThread).id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages',
            filter: `thread_id=eq.${(thr as DMThread).id}`,
          },
          (payload) => {
            if (cancelled) return;
            setMessages((prev) => [...prev, payload.new as DMMessage]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    }

    const cleanup = init();
    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
    };
  }, [myUid, otherUid]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!thread || !myUid || sending) return;
      const trimmed = body.trim();
      if (trimmed.length === 0 || trimmed.length > 4000) return;
      setSending(true);
      const { error: sendErr } = await supabase
        .from('dm_messages')
        .insert({ thread_id: thread.id, sender_id: myUid, body: trimmed });
      if (sendErr) console.error('Error enviando DM:', sendErr);
      setSending(false);
    },
    [thread, myUid, sending]
  );

  return { thread, messages, loading, sending, error, sendMessage };
}
