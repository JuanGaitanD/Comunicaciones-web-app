import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { CallMessage } from '../types';

export function useCallMessages(callId: string | null, myUid: string | null) {
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!callId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('call_messages')
        .select('*')
        .eq('call_id', callId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        console.error('Error cargando call_messages:', error);
        setLoading(false);
        return;
      }
      setMessages(((data ?? []) as CallMessage[]).reverse());
      setLoading(false);
    })();

    const ch = supabase
      .channel(`call-messages-${callId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_messages', filter: `call_id=eq.${callId}` },
        (payload) => {
          const msg = payload.new as CallMessage;
          setMessages((prev) => {
            // Defensa contra duplicados (si el listener dispara dos veces).
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [callId]);

  const send = useCallback(
    async (body: string) => {
      if (!callId || !myUid) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      const { error } = await supabase.from('call_messages').insert({
        call_id: callId,
        sender_id: myUid,
        body: trimmed,
      });
      if (error) throw error;
    },
    [callId, myUid]
  );

  return { messages, loading, send };
}
