import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, AlertCircle } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { Participant, Mood, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface CallRoomProps {
  callId: string;
  userProfile: UserProfile;
  onLeave: () => void;
}

const MOODS: { type: Mood; emoji: string; label: string }[] = [
  { type: 'feliz', emoji: '😊', label: 'Feliz' },
  { type: 'enojado', emoji: '😠', label: 'Enojado' },
  { type: 'frustrado', emoji: '😤', label: 'Frustrado' },
  { type: 'perdido', emoji: '😵', label: 'Perdido' },
  { type: 'enamorado', emoji: '😍', label: 'Enamorado' },
  { type: 'emocionado', emoji: '🤩', label: 'Emocionado' },
];

const HEARTBEAT_MS = 60_000;

function ParticipantCard({
  participant,
  stream,
  isLocal,
  volume,
  onVolumeChange,
}: {
  participant: Participant;
  stream: MediaStream | null;
  isLocal?: boolean;
  volume?: number;
  onVolumeChange?: (v: number) => void;
}) {
  const audioLevel = useAudioLevel(stream);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream && !isLocal) {
      audioRef.current.srcObject = stream;
      audioRef.current.volume = volume ?? 1;
      // Chrome bloquea autoplay del <audio> cuando el stream también está
      // conectado a un AudioContext (useAudioLevel). Forzar play.
      audioRef.current.play().catch((err) => {
        console.warn('No se pudo reproducir audio remoto:', err);
      });
    }
  }, [stream, isLocal, volume]);

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
        <h3 className="font-bold text-[var(--text)]">{participant.displayName}</h3>
        <p className="text-xs text-[var(--muted)] capitalize">
          {participant.isMuted ? 'En silencio' : (participant.mood === 'none' ? 'Conectado' : participant.mood)}
        </p>
      </div>

      {!isLocal && (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2">
            <Volume2 size={14} className="text-[var(--muted)]" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume ?? 1}
              onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-[var(--accent)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
            />
          </div>
          <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
        </div>
      )}
    </motion.div>
  );
}

export default function CallRoom({ callId, userProfile, onLeave }: CallRoomProps) {
  const [participants, setParticipants] = useState<{ [uid: string]: Participant }>({});
  const [isMuted, setIsMuted] = useState(false);
  const [currentMood, setCurrentMood] = useState<Mood>('none');
  const [callName, setCallName] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [localVolumes, setLocalVolumes] = useState<{ [uid: string]: number }>({});
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const joinedAtRef = useRef<string>(new Date().toISOString());
  const moodRef = useRef<Mood>('none');
  const mutedRef = useRef<boolean>(false);
  const knownPeersRef = useRef<Set<string>>(new Set());

  const { localStream, remoteStreams, initiateCall } = useWebRTC(callId, userProfile.uid, channel);

  // 1. Cargar info de la llamada inicial y suscribirse a cambios de su fila.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('name, creator_id, status')
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
          const row = payload.new as any;
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

    joinedAtRef.current = new Date().toISOString();
    moodRef.current = 'none';
    mutedRef.current = false;
    knownPeersRef.current.clear();
    setCurrentMood('none');
    setIsMuted(false);

    const ch = supabase.channel(`call:${callId}`, {
      config: { presence: { key: userProfile.uid } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const next: { [uid: string]: Participant } = {};
      for (const [uid, items] of Object.entries(state)) {
        const arr = items as any[];
        // El último item tiene el payload más reciente cuando hay re-tracks.
        const item = arr[arr.length - 1];
        if (!item) continue;
        next[uid] = {
          uid,
          displayName: item.displayName,
          photoURL: item.photoURL,
          joinedAt: item.joinedAt,
          mood: item.mood,
          isMuted: item.isMuted,
        };
      }
      setParticipants(next);
    });

    ch.on('presence', { event: 'leave' }, ({ key, currentPresences }) => {
      // Solo eliminar si no quedan presencias activas para ese uid.
      // IMPORTANTE: cada track() dispara un leave del estado anterior seguido de sync;
      // si currentPresences > 0 el peer sigue conectado (solo actualizó su estado).
      if (!currentPresences || currentPresences.length === 0) {
        setParticipants((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          displayName: userProfile.displayName,
          photoURL: userProfile.photoURL,
          joinedAt: joinedAtRef.current,
          mood: moodRef.current,
          isMuted: mutedRef.current,
        });
      }
    });

    setChannel(ch);

    return () => {
      ch.untrack();
      supabase.removeChannel(ch);
      setChannel(null);
      setParticipants({});
    };
  }, [callId, userProfile.uid, userProfile.displayName, userProfile.photoURL]);

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

  // 5. Sincronizar isMuted al track de presence + al audio track.
  useEffect(() => {
    mutedRef.current = isMuted;
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) track.enabled = !isMuted;
    }
    if (channel) {
      channel.track({
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        joinedAt: joinedAtRef.current,
        mood: moodRef.current,
        isMuted,
      });
    }
  }, [isMuted, localStream, channel, userProfile.displayName, userProfile.photoURL]);

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
    if (channel) {
      channel.track({
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        joinedAt: joinedAtRef.current,
        mood: newMood,
        isMuted: mutedRef.current,
      });
    }
  }, [currentMood, channel, userProfile.displayName, userProfile.photoURL]);

  const handleVolumeChange = (uid: string, volume: number) => {
    setLocalVolumes(prev => ({ ...prev, [uid]: volume }));
  };

  const handleLeaveClick = () => {
    if (userProfile.uid === creatorId) {
      setShowLeaveModal(true);
    } else {
      onLeave();
    }
  };

  const handleEndCallForAll = async () => {
    const { error } = await supabase
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', callId);
    if (error) {
      console.error('Error cerrando llamada:', error);
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
                  className="w-full py-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Terminar para todos
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
        <button
          onClick={handleLeaveClick}
          className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center gap-2"
          aria-label="Terminar comunicación (Esc)"
        >
          <PhoneOff size={20} /> <span className="hidden sm:inline">Terminar</span>
        </button>
      </header>

      <main className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 content-start">
        <AnimatePresence>
          {Object.values(participants).map((p: Participant) => (
            <ParticipantCard
              key={p.uid}
              participant={p}
              stream={p.uid === userProfile.uid ? localStream : remoteStreams[p.uid]}
              isLocal={p.uid === userProfile.uid}
              volume={localVolumes[p.uid]}
              onVolumeChange={(v) => handleVolumeChange(p.uid, v)}
            />
          ))}
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
    </div>
  );
}
