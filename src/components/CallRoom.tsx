import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, AlertCircle, UserPlus, Clock, MessageSquare, Link as LinkIcon, Check } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useCallMessages } from '../hooks/useCallMessages';
import { Participant, Mood, UserProfile, FriendWithProfile } from '../types';
import { cn } from '../lib/utils';
import CallChatPanel from './CallChatPanel';

interface CallRoomProps {
  callId: string;
  userProfile: UserProfile;
  onLeave: () => void;
  friends: FriendWithProfile[];
  sent: FriendWithProfile[];
  sendFriendRequest: (targetUid: string) => Promise<void>;
}

type FriendRelation = 'friends' | 'sent' | 'none';

const MOODS: { type: Mood; emoji: string; label: string }[] = [
  { type: 'feliz', emoji: '😊', label: 'Feliz' },
  { type: 'enojado', emoji: '😠', label: 'Enojado' },
  { type: 'frustrado', emoji: '😤', label: 'Frustrado' },
  { type: 'perdido', emoji: '😵', label: 'Perdido' },
  { type: 'enamorado', emoji: '😍', label: 'Enamorado' },
  { type: 'emocionado', emoji: '🤩', label: 'Emocionado' },
];

const HEARTBEAT_MS = 60_000;

/** Shape mínima que esperamos del payload postgres_changes de la tabla `calls`. */
interface CallRow {
  status: 'active' | 'ended';
  name?: string;
}

/** Shape del slot de presencia que el SDK de Supabase almacena para cada participante. */
interface PresenceItem {
  displayName: string;
  photoURL: string;
  joinedAt: string;
}

function ParticipantCard({
  participant,
  stream,
  isLocal,
  volume,
  onVolumeChange,
  isMutedByListener,
  onToggleListenerMute,
  friendRelation,
  onSendFriendRequest,
  friendRequestPending,
}: {
  participant: Participant;
  stream: MediaStream | null;
  isLocal?: boolean;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  isMutedByListener?: boolean;
  onToggleListenerMute?: () => void;
  friendRelation?: FriendRelation;
  onSendFriendRequest?: () => void;
  friendRequestPending?: boolean;
}) {
  const audioLevel = useAudioLevel(stream);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el && stream && !isLocal) {
      el.srcObject = stream;
      el.volume = isMutedByListener ? 0 : (volume ?? 1);
      // Chrome bloquea autoplay del <audio> cuando el stream también está
      // conectado a un AudioContext (useAudioLevel). Forzar play.
      el.play().catch((err) => {
        console.warn('No se pudo reproducir audio remoto:', err);
      });
    }
    return () => {
      // Liberar la referencia al MediaStream para que el GC pueda recogerlo.
      if (el) el.srcObject = null;
    };
  }, [stream, isLocal, volume, isMutedByListener]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="card p-6 flex flex-col items-center space-y-4 relative"
    >
      <div className="relative">
        <motion.div
          animate={{
            scale: participant.isMuted ? 1 : 1 + (audioLevel * 0.3),
            opacity: participant.isMuted ? 0 : audioLevel > 0.1 ? 0.6 : 0,
          }}
          className="absolute inset-0 rounded-full border-4 border-[var(--primary)] blur-sm"
        />

        <img
          src={participant.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.uid}`}
          alt={participant.displayName}
          referrerPolicy="no-referrer"
          className={cn(
            "w-24 h-24 rounded-full border-4 transition-all duration-300 relative z-10",
            participant.mood !== 'none' ? "border-[var(--primary)] scale-110" : "border-[var(--border)]",
            !participant.isMuted && audioLevel > 0.1 ? "border-[var(--primary)]" : ""
          )}
        />
        {participant.mood !== 'none' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2 text-3xl bg-[var(--card)] rounded-full p-1 shadow-lg z-20"
          >
            {MOODS.find(m => m.type === participant.mood)?.emoji}
          </motion.div>
        )}
        {participant.isMuted && (
          <div className="absolute bottom-0 right-0 bg-red-500 text-white p-1 rounded-full border-2 border-[var(--card)] z-20">
            <MicOff size={14} />
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <h3 className="font-bold text-[var(--text)]">{participant.displayName}</h3>
          {!isLocal && friendRelation === 'none' && (
            <button
              onClick={onSendFriendRequest}
              disabled={friendRequestPending}
              className="p-1 rounded-md bg-[var(--accent)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all disabled:opacity-50"
              title="Enviar solicitud de amistad"
              aria-label="Enviar solicitud de amistad"
            >
              <UserPlus size={12} />
            </button>
          )}
          {!isLocal && friendRelation === 'sent' && (
            <span
              className="p-1 rounded-md bg-[var(--accent)] text-[var(--muted)]"
              title="Solicitud enviada"
              aria-label="Solicitud enviada"
            >
              <Clock size={12} />
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)] capitalize">
          {participant.isMuted ? 'En silencio' : (participant.mood === 'none' ? 'Conectado' : participant.mood)}
        </p>
      </div>

      {!isLocal && (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleListenerMute}
              className="flex-shrink-0 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              title={isMutedByListener ? 'Activar audio' : 'Silenciar'}
              aria-label={isMutedByListener ? 'Activar audio' : 'Silenciar'}
            >
              {isMutedByListener ? <VolumeX size={14} className="text-red-400" /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume ?? 1}
              onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
              disabled={isMutedByListener}
              className="flex-1 h-1 bg-[var(--accent)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
        </div>
      )}
    </motion.div>
  );
}

export default function CallRoom({ callId, userProfile, onLeave, friends, sent, sendFriendRequest }: CallRoomProps) {
  const [participants, setParticipants] = useState<{ [uid: string]: Participant }>({});
  const [isMuted, setIsMuted] = useState(false);
  const [currentMood, setCurrentMood] = useState<Mood>('none');
  const [callName, setCallName] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [localVolumes, setLocalVolumes] = useState<{ [uid: string]: number }>({});
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  // reconnectTick: se incrementa cuando el canal Realtime se cierra
  // inesperadamente desde el servidor. Va en las deps de Effect 2 → fuerza
  // la creación de un canal nuevo (con backoff de 1s). El estado local de
  // mood/mute se preserva entre reconexiones para no perder cambios recientes.
  const [reconnectTick, setReconnectTick] = useState(0);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [friendRequestPending, setFriendRequestPending] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [lastReadCount, setLastReadCount] = useState(0);
  const [callVisibility, setCallVisibility] = useState<'public' | 'private'>('public');
  const [callInviteCode, setCallInviteCode] = useState<string | null>(null);
  const [localMuted, setLocalMuted] = useState<{ [uid: string]: boolean }>({});
  const [toast, setToast] = useState<string | null>(null);

  const { messages: chatMessages, loading: chatLoading, send: sendChatMessage } = useCallMessages(callId, userProfile.uid);

  // Sincroniza lastReadCount mientras el chat está abierto: cualquier mensaje
  // nuevo se considera leído inmediatamente. Al cerrar el panel, queda fijo
  // hasta que llegue otro mensaje (que entonces sí incrementa el badge).
  useEffect(() => {
    if (chatOpen) setLastReadCount(chatMessages.length);
  }, [chatOpen, chatMessages.length]);

  const unreadChat = chatOpen ? 0 : Math.max(0, chatMessages.length - lastReadCount);

  const participantsMap = useMemo(() => {
    const m = new Map<string, { displayName: string; photoURL: string }>();
    for (const p of Object.values(participants)) {
      m.set(p.uid, { displayName: p.displayName, photoURL: p.photoURL });
    }
    return m;
  }, [participants]);

  const friendRelationOf = useCallback((uid: string): FriendRelation => {
    if (friends.some((f) => f.otherUid === uid)) return 'friends';
    if (sent.some((f) => f.otherUid === uid)) return 'sent';
    return 'none';
  }, [friends, sent]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleSendFriendRequest = useCallback(async (uid: string) => {
    if (friendRequestPending.has(uid)) return;
    setFriendRequestPending((prev) => new Set(prev).add(uid));
    try {
      await sendFriendRequest(uid);
      showToast('Solicitud de amistad enviada');
    } catch (err) {
      console.error('Error enviando solicitud:', err);
      setFriendRequestPending((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }, [friendRequestPending, sendFriendRequest, showToast]);

  const joinedAtRef = useRef<string>(new Date().toISOString());
  const moodRef = useRef<Mood>('none');
  const mutedRef = useRef<boolean>(false);
  const knownPeersRef = useRef<Set<string>>(new Set());
  // presenceUidsRef: uids vistos en el último sync. Sirve para detectar
  // peers nuevos y broadcastear nuestro estado dinámico (mood/isMuted) a
  // ellos, ya que estos campos viajan por Broadcast y no por Presence.
  const presenceUidsRef = useRef<Set<string>>(new Set());
  // channelRef: solo se asigna cuando el canal está SUBSCRIBED.
  // Evita que Effect 5 llame track() antes de que el canal esté listo
  // (lo que acumularía entradas fantasma en presenceState).
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Clave estable del conjunto de uids vivos. Evita que useWebRTC reciba un
  // array nuevo en cada render (Object.keys devuelve referencia nueva siempre)
  // y dispare cleanups espurios cuando solo cambia mood/mute local.
  const peerUidsKey = useMemo(
    () => Object.keys(participants).sort().join(','),
    [participants]
  );

  const { localStream, remoteStreams, initiateCall } = useWebRTC(callId, userProfile.uid, channel, peerUidsKey);

  // 1. Cargar info de la llamada inicial y suscribirse a cambios de su fila.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('name, creator_id, status, visibility, invite_code')
        .eq('id', callId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        console.error('Error cargando llamada:', error);
        onLeave();
        return;
      }
      setCallName(data.name);
      setCreatorId(data.creator_id);
      setCallVisibility(data.visibility ?? 'public');
      setCallInviteCode(data.invite_code ?? null);
      if (data.status === 'ended') {
        onLeave();
      }
    })();

    const statusChannel = supabase
      .channel(`call-status:${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as CallRow;
          if (row.status === 'ended') onLeave();
          if (row.name) setCallName(row.name);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(statusChannel);
    };
  }, [callId, onLeave]);

  // 2. Crear el canal Presence + Broadcast.
  useEffect(() => {
    if (!callId || !userProfile.uid) return;

    // Solo reseteamos en la conexión inicial. En reconexión preservamos
    // mood/mute/knownPeers para no perder cambios recientes ni reiniciar WebRTC.
    if (reconnectTick === 0) {
      joinedAtRef.current = new Date().toISOString();
      moodRef.current = 'none';
      mutedRef.current = false;
      knownPeersRef.current.clear();
      setCurrentMood('none');
      setIsMuted(false);
    }
    // En reconexión también limpiamos presenceUidsRef: el nuevo canal hará
    // sync desde cero y debemos re-broadcastear nuestro estado a los peers
    // que veamos "nuevos" (que en realidad estaban antes pero no en este canal).
    presenceUidsRef.current = new Set();

    const ch = supabase.channel(`call:${callId}`, {
      config: { presence: { key: userProfile.uid } },
    });

    // Presence: identidad estática (displayName, photoURL, joinedAt).
    // El estado dinámico (mood, isMuted) viaja por Broadcast.
    // Razón: track() en Supabase Realtime no reemplaza el slot — el servidor
    // acumula entries y termina cerrando el canal por sobrecarga.
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const currentUids = new Set<string>();
      setParticipants(prev => {
        const next: { [uid: string]: Participant } = {};
        for (const [uid, items] of Object.entries(state)) {
          const arr = items as unknown as PresenceItem[];
          const item = arr[arr.length - 1];
          if (!item) continue;
          currentUids.add(uid);
          next[uid] = {
            uid,
            displayName: item.displayName,
            photoURL: item.photoURL,
            joinedAt: item.joinedAt,
            // mood/isMuted/isSharingScreen vienen de Broadcast. Preservamos lo
            // que ya teníamos y dejamos defaults si nunca recibimos broadcast
            // de este peer.
            mood: prev[uid]?.mood ?? 'none',
            isMuted: prev[uid]?.isMuted ?? false,
            isSharingScreen: prev[uid]?.isSharingScreen ?? false,
          };
        }
        return next;
      });
      // Detectar peers nuevos respecto al último sync de ESTE canal.
      // Si entró alguien nuevo, broadcasteamos nuestro estado para que nos
      // vea con el mood/isMuted correcto en lugar de los defaults.
      const newcomers: string[] = [];
      for (const uid of currentUids) {
        if (uid !== userProfile.uid && !presenceUidsRef.current.has(uid)) {
          newcomers.push(uid);
        }
      }
      presenceUidsRef.current = currentUids;
      if (newcomers.length > 0 && channelRef.current === ch) {
        ch.send({
          type: 'broadcast',
          event: 'peer-state',
          payload: {
            uid: userProfile.uid,
            mood: moodRef.current,
            isMuted: mutedRef.current,
          },
        });
      }
    });

    // Broadcast: estado dinámico de cada peer. Sin acumulación porque
    // broadcast no persiste — cada mensaje es independiente y sustituye
    // el estado anterior en nuestro local participants[uid].
    ch.on('broadcast', { event: 'peer-state' }, ({ payload }) => {
      const { uid, mood, isMuted } = payload as {
        uid: string;
        mood: Mood;
        isMuted: boolean;
      };
      // Solo aplicamos para peers remotos. Nuestro propio estado lo
      // controlamos localmente con isMuted/currentMood.
      if (uid === userProfile.uid) return;
      setParticipants(prev => {
        if (!prev[uid]) return prev; // todavía no tenemos su presence
        return { ...prev, [uid]: { ...prev[uid], mood, isMuted } };
      });
    });

    // No registramos handler de 'leave' explícito:
    // - Cada untrack()+track() genera un leave seguido de sync; si borrásemos
    //   al participante en el leave, habría un flash visual y se reiniciaría WebRTC.
    // - El handler de 'sync' ya reconstruye el estado completo; cuando un peer
    //   realmente se desconecta, el sync llega sin ese uid y lo elimina de participants.

    // active: impide que el callback de subscribe actúe si React ya limpió este
    // effect (React StrictMode en dev monta→desmonta→remonta; sin este flag el
    // canal antiguo también llamaría track() y acumularía entradas fantasma).
    let active = true;
    // Timer de reconexión: lo guardamos para poder cancelarlo en el cleanup
    // y evitar setState tras unmount o disparos duplicados si el servidor
    // emite CLOSED+CHANNEL_ERROR en cascada.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    ch.subscribe(async (status) => {
      // Si el canal se cerró inesperadamente desde el servidor, limpiar la ref
      // para que Effect 5 no intente trackear sobre un canal muerto → timed out.
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        if (channelRef.current === ch) channelRef.current = null;
        if (active && reconnectTimer === null) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (active) setReconnectTick(t => t + 1);
          }, 1000);
        }
        return;
      }
      if (!active || status !== 'SUBSCRIBED') return;
      channelRef.current = ch;
      // Track inicial: solo identidad. mood/isMuted se envían por broadcast.
      const result = await ch.track({
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        joinedAt: joinedAtRef.current,
      });
      // Si tenemos mood/isMuted activos (reconexión), broadcastearlos para
      // que los peers existentes nos vean con el estado correcto.
      if (moodRef.current !== 'none' || mutedRef.current) {
        ch.send({
          type: 'broadcast',
          event: 'peer-state',
          payload: {
            uid: userProfile.uid,
            mood: moodRef.current,
            isMuted: mutedRef.current,
          },
        });
      }
    });

    setChannel(ch);

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      channelRef.current = null;
      ch.untrack();
      supabase.removeChannel(ch);
      setChannel(null);
      setParticipants({});
    };
  }, [callId, userProfile.uid, userProfile.displayName, userProfile.photoURL, reconnectTick]);

  // 3. Iniciar oferta WebRTC para peers nuevos (regla: uid mayor inicia).
  useEffect(() => {
    for (const uid of Object.keys(participants)) {
      if (uid === userProfile.uid) continue;
      if (knownPeersRef.current.has(uid)) continue;
      knownPeersRef.current.add(uid);
      if (userProfile.uid > uid) initiateCall(uid);
    }
    // Olvidar peers que ya no están (por si reentran).
    for (const uid of Array.from(knownPeersRef.current)) {
      if (uid !== userProfile.uid && !participants[uid]) {
        knownPeersRef.current.delete(uid);
      }
    }
  }, [participants, userProfile.uid, initiateCall]);

  // 4. Heartbeat de actividad: RPC touch_call cada 60s.
  useEffect(() => {
    if (!callId) return;
    const tick = () => {
      supabase.rpc('touch_call', { p_call_id: callId }).then(({ error }) => {
        if (error) console.error('touch_call falló:', error);
      });
    };
    tick();
    const id = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [callId]);

  // 5a. Sincronizar isMuted al track de audio local.
  //     localStream SÍ está en deps porque necesitamos habilitar/deshabilitar el track.
  useEffect(() => {
    mutedRef.current = isMuted;
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) track.enabled = !isMuted;
    }
  }, [isMuted, localStream]);

  // 5b. Broadcast del estado dinámico (mute) cuando cambia.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({
      type: 'broadcast',
      event: 'peer-state',
      payload: {
        uid: userProfile.uid,
        mood: moodRef.current,
        isMuted,
      },
    });
  }, [isMuted, userProfile.uid]);

  // 6. Atajos de teclado.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') setIsMuted(prev => !prev);
      if (e.key === 'Escape') onLeave();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onLeave]);

  const handleMoodSelect = useCallback((mood: Mood) => {
    const newMood: Mood = currentMood === mood ? 'none' : mood;
    setCurrentMood(newMood);
    moodRef.current = newMood;
    const ch = channelRef.current;
    if (ch) {
      ch.send({
        type: 'broadcast',
        event: 'peer-state',
        payload: {
          uid: userProfile.uid,
          mood: newMood,
          isMuted: mutedRef.current,
        },
      });
    }
  }, [currentMood, userProfile.uid]);

  const handleVolumeChange = useCallback((uid: string, volume: number) => {
    setLocalVolumes(prev => ({ ...prev, [uid]: volume }));
  }, []);

  const handleToggleListenerMute = useCallback((uid: string) => {
    setLocalMuted(prev => ({ ...prev, [uid]: !prev[uid] }));
  }, []);

  const handleLeaveClick = () => {
    if (userProfile.uid === creatorId) {
      setShowLeaveModal(true);
    } else {
      onLeave();
    }
  };

  const handleEndCallForAll = async () => {
    if (isEndingCall) return;
    setIsEndingCall(true);
    const { error } = await supabase
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId);
    if (error) {
      console.error('Error cerrando llamada:', error);
      setIsEndingCall(false);
      return;
    }
    onLeave();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] p-6">
      <AnimatePresence>
        {showLeaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="card max-w-md w-full p-8 space-y-6 shadow-2xl border-t-4 border-t-red-500"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 bg-red-50 text-red-500 rounded-full">
                  <AlertCircle size={48} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-[var(--text)]">¿Terminar comunicación?</h3>
                  <p className="text-[var(--muted)]">Eres el creador de esta sala. Puedes salirte tú solo o terminar la llamada para todos los participantes.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleEndCallForAll}
                  disabled={isEndingCall}
                  className="w-full py-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isEndingCall ? 'Terminando...' : 'Terminar para todos'}
                </button>
                <button
                  onClick={onLeave}
                  className="w-full py-4 bg-[var(--accent)] text-[var(--text)] font-bold rounded-xl hover:bg-[var(--border)] transition-all"
                >
                  Solo salirme yo
                </button>
                <button
                  onClick={() => setShowLeaveModal(false)}
                  className="w-full py-3 text-[var(--muted)] font-medium hover:text-[var(--text)] transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{callName}</h1>
          <p className="text-sm text-[var(--muted)]">{Object.keys(participants).length} participantes conectados</p>
        </div>
        <div className="relative flex items-center gap-2">
          {callVisibility === 'private' && callInviteCode && (
            <button
              onClick={async () => {
                const base = import.meta.env.BASE_URL || '/';
                const link = `${window.location.origin}${base}?invite=${callInviteCode}`;
                await navigator.clipboard.writeText(link);
                showToast('Link de invitación copiado');
              }}
              className="p-3 rounded-full bg-[var(--accent)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
              aria-label="Copiar link de invitación"
              title="Copiar link de invitación"
            >
              <LinkIcon size={20} />
            </button>
          )}
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={cn(
              'relative p-3 rounded-full transition-colors flex items-center gap-2',
              chatOpen
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--accent)] text-[var(--text)] hover:bg-[var(--border)]'
            )}
            aria-label="Chat de la llamada"
            title="Chat"
          >
            <MessageSquare size={20} />
            {unreadChat > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
          <button
            onClick={handleLeaveClick}
            className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center gap-2"
            aria-label="Terminar comunicación (Esc)"
          >
            <PhoneOff size={20} /> <span className="hidden sm:inline">Terminar</span>
          </button>

          {/* Toast de confirmación — sale debajo de los botones */}
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast}
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                className="absolute top-full right-0 mt-2 z-[60] flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl text-sm font-medium text-[var(--text)] whitespace-nowrap"
              >
                <Check size={15} className="text-green-500 flex-shrink-0" />
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 content-start">
        <AnimatePresence>
          {Object.values(participants).map((p: Participant) => {
            // Para nuestra propia tarjeta usamos el estado local de mood/mute
            // (es la fuente de verdad). Para peers remotos, lo que tengamos
            // en participants[uid] viene del broadcast.
            const display: Participant = p.uid === userProfile.uid
              ? { ...p, mood: currentMood, isMuted }
              : p;
            return (
              <ParticipantCard
                key={p.uid}
                participant={display}
                stream={p.uid === userProfile.uid ? localStream : remoteStreams[p.uid]}
                isLocal={p.uid === userProfile.uid}
                volume={localVolumes[p.uid]}
                onVolumeChange={(v) => handleVolumeChange(p.uid, v)}
                isMutedByListener={localMuted[p.uid] ?? false}
                onToggleListenerMute={() => handleToggleListenerMute(p.uid)}
                friendRelation={friendRelationOf(p.uid)}
                onSendFriendRequest={() => handleSendFriendRequest(p.uid)}
                friendRequestPending={friendRequestPending.has(p.uid)}
              />
            );
          })}
        </AnimatePresence>
      </main>

      <footer className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-6 p-4 card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(prev => !prev)}
            className={cn(
              "p-4 rounded-full transition-all flex items-center gap-2 font-medium",
              isMuted ? "bg-red-100 text-red-600" : "bg-[var(--accent)] text-[var(--text)]"
            )}
            aria-label={isMuted ? "Activar micrófono (M)" : "Silenciar micrófono (M)"}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            <span className="hidden sm:inline">{isMuted ? 'Silenciado' : 'Hablando'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[var(--bg)] p-2 rounded-full border border-[var(--border)]">
          {MOODS.map((m) => (
            <button
              key={m.type}
              onClick={() => handleMoodSelect(m.type)}
              className={cn(
                "p-2 rounded-full text-2xl hover:bg-[var(--accent)] transition-all",
                currentMood === m.type ? "bg-[var(--primary)] scale-125" : ""
              )}
              title={m.label}
              aria-label={`Sentirse ${m.label}`}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        <div className="text-[var(--muted)] text-sm hidden lg:block">
          <p>Atajos: <strong>M</strong> para micro, <strong>Esc</strong> para salir</p>
        </div>
      </footer>

      <CallChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        loading={chatLoading}
        send={sendChatMessage}
        myUid={userProfile.uid}
        participantsMap={participantsMap}
      />

    </div>
  );
}
