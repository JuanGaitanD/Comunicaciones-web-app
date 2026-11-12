import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, AlertCircle, UserPlus, Clock, MessageSquare, Link as LinkIcon, Check, Monitor, MonitorOff, Loader2, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { useWebRTC, canShareScreen } from '../hooks/useWebRTC';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useCallMessages } from '../hooks/useCallMessages';
import { useDialogo } from '../hooks/useDialogo';
import { usePermisoMicro } from '../hooks/usePermisoMicro';
import { Participant, Mood, UserProfile, FriendWithProfile } from '../types';
import { cn } from '../lib/utils';
import CallChatPanel from './CallChatPanel';
import Boton from './ui/Boton';
import MensajeError from './ui/MensajeError';
import ChipEstado from './ui/ChipEstado';
import Medidor from './ui/Medidor';

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

// Mapeo del RTCPeerConnectionState a un descriptor visual. Solo retornamos algo
// cuando hay información útil para el usuario: 'connected' y casos sin estado
// no muestran nada para no saturar la UI cuando todo funciona. El estado se dice
// con icono y texto, nunca solo con un punto de color.
function describeConnectionState(state: RTCPeerConnectionState | undefined): {
  icono: LucideIcon;
  tono: 'aviso' | 'peligro';
  label: string;
} | null {
  switch (state) {
    case 'new':
    case 'connecting':
      return { icono: Loader2, tono: 'aviso', label: 'Conectando…' };
    case 'disconnected':
      return { icono: RefreshCw, tono: 'aviso', label: 'Reconectando…' };
    case 'failed':
      return { icono: WifiOff, tono: 'peligro', label: 'Sin audio (red bloqueada)' };
    default:
      return null;
  }
}

function ParticipantCard({
  participant,
  stream,
  screenStream,
  isLocal,
  volume,
  onVolumeChange,
  isMutedByListener,
  onToggleListenerMute,
  friendRelation,
  onSendFriendRequest,
  friendRequestPending,
  compact,
  connectionState,
}: {
  participant: Participant;
  stream: MediaStream | null;
  screenStream?: MediaStream | null;
  isLocal?: boolean;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  isMutedByListener?: boolean;
  onToggleListenerMute?: () => void;
  friendRelation?: FriendRelation;
  onSendFriendRequest?: () => void;
  friendRequestPending?: boolean;
  compact?: boolean;
  connectionState?: RTCPeerConnectionState;
}) {
  const connDesc = !isLocal ? describeConnectionState(connectionState) : null;
  const audioLevel = useAudioLevel(stream);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // En modo compact el hero ya muestra el video — no duplicar.
  const showingScreen = !compact && !!(participant.isSharingScreen && screenStream);
  const speaking = !participant.isMuted && audioLevel > 0.1;
  const moodEmoji = participant.mood !== 'none' ? MOODS.find((m) => m.type === participant.mood) : undefined;
  const statusText = participant.isMuted ? 'En silencio' : speaking ? 'Hablando' : participant.mood === 'none' ? 'Conectado' : participant.mood;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (showingScreen && screenStream) {
      el.srcObject = screenStream;
      el.play().catch((err) => console.warn('No se pudo reproducir screen share:', err));
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [screenStream, showingScreen]);

  useEffect(() => {
    const el = audioRef.current;
    if (el && stream && !isLocal) {
      el.srcObject = stream;
      el.volume = isMutedByListener ? 0 : (volume ?? 1);
      el.play().catch((err) => {
        console.warn('No se pudo reproducir audio remoto:', err);
      });
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, isLocal, volume, isMutedByListener]);

  const avatarUrl = participant.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.uid}`;
  const chipConexion = connDesc && (
    <ChipEstado icono={connDesc.icono} tono={connDesc.tono} className="max-w-full !whitespace-normal py-0.5 text-left">
      {connDesc.label}
    </ChipEstado>
  );

  /* ─── Modo compacto: fila de 64 px para la barra lateral del héroe ─── */
  if (compact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="card relative flex min-h-16 flex-none snap-start items-center gap-3 p-3 max-md:w-60"
      >
        <div className="relative flex-shrink-0">
          <img
            src={avatarUrl}
            alt={participant.displayName}
            referrerPolicy="no-referrer"
            className={cn('h-10 w-10 rounded-full border-[3px]', speaking ? 'border-accion' : 'border-separador')}
          />
          {moodEmoji && (
            <span role="img" aria-label={moodEmoji.label} className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-superficie text-xs">
              {moodEmoji.emoji}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <span className="truncate">{participant.displayName}</span>
            {participant.isSharingScreen && (
              <>
                <Monitor size={16} className="flex-shrink-0 text-accion-tinta" aria-hidden="true" />
                <span className="sr-only">Compartiendo pantalla</span>
              </>
            )}
          </h3>
          <p className="flex items-center gap-1 truncate text-xs font-medium text-texto-secundario">
            {participant.isMuted && <MicOff size={12} className="flex-none text-peligro-tinta" aria-hidden="true" />}
            <span className="inline-block truncate first-letter:uppercase">{statusText}</span>
          </p>
          {!isLocal && <div aria-live="polite">{chipConexion}</div>}
        </div>
        {participant.isMuted ? null : <Medidor nivel={audioLevel} mini />}
        {!isLocal && <audio ref={audioRef} autoPlay style={{ display: 'none' }} />}
      </motion.div>
    );
  }

  /* ─── Modo normal: canal de la consola ─── */
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="card relative flex flex-col items-center gap-3 p-4 text-center lg:min-h-[320px] lg:p-6"
    >
      {showingScreen ? (
        <div className="relative w-full">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="aspect-video w-full rounded-control bg-black object-contain"
          />
          <ChipEstado icono={Monitor} className="absolute left-2 top-2 !bg-superficie !text-texto">
            Compartiendo
          </ChipEstado>
          {participant.isMuted && (
            <span className="absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-peligro text-sobre-peligro" aria-hidden="true">
              <MicOff size={14} />
            </span>
          )}
        </div>
      ) : (
        <div className="relative">
          <img
            src={avatarUrl}
            alt={participant.displayName}
            referrerPolicy="no-referrer"
            className={cn(
              'h-16 w-16 rounded-full border-[3px] sm:h-[88px] sm:w-[88px] lg:h-28 lg:w-28',
              speaking ? 'border-accion' : 'border-separador'
            )}
          />
          {moodEmoji && (
            <span
              role="img"
              aria-label={moodEmoji.label}
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-separador bg-superficie text-lg"
            >
              {moodEmoji.emoji}
            </span>
          )}
          {participant.isMuted && (
            <span className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-peligro text-sobre-peligro" aria-hidden="true">
              <MicOff size={14} />
            </span>
          )}
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-1.5">
        <div className="flex items-center justify-center gap-1">
          <h3 className="text-balance break-words text-base font-semibold">{participant.displayName}</h3>
          {!isLocal && friendRelation === 'none' && (
            <Boton
              variante="plano"
              tono="accion"
              onClick={onSendFriendRequest}
              disabled={friendRequestPending}
              title="Enviar solicitud de amistad"
              aria-label="Enviar solicitud de amistad"
            >
              <UserPlus size={20} aria-hidden="true" />
            </Boton>
          )}
        </div>
        {!isLocal && friendRelation === 'sent' && (
          <ChipEstado icono={Clock}>Solicitud enviada</ChipEstado>
        )}
        <p className="flex items-center justify-center gap-2 text-sm text-texto-secundario">
          {participant.isMuted ? (
            <MicOff size={16} className="text-peligro-tinta" aria-hidden="true" />
          ) : (
            <Medidor nivel={audioLevel} />
          )}
          <span className="inline-block first-letter:uppercase">{statusText}</span>
        </p>
        {!isLocal && <div aria-live="polite">{chipConexion}</div>}
      </div>

      {!isLocal && (
        <div className="flex w-full items-center gap-1">
          <Boton
            variante="plano"
            tono={isMutedByListener ? 'peligro' : undefined}
            data-fijo={isMutedByListener ? '' : undefined}
            onClick={onToggleListenerMute}
            aria-pressed={!!isMutedByListener}
            aria-label={`Silenciar a ${participant.displayName}`}
            title={isMutedByListener ? 'Activar audio' : 'Silenciar'}
            className="flex-none"
          >
            {isMutedByListener ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
          </Boton>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume ?? 1}
            onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
            disabled={isMutedByListener}
            aria-label={`Volumen de ${participant.displayName}`}
            aria-valuetext={`${Math.round((volume ?? 1) * 100)} %`}
            style={{ ['--llenado' as string]: `${Math.round((volume ?? 1) * 100)}%` }}
            className="fader min-w-0 flex-1"
          />
          <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
        </div>
      )}
    </motion.div>
  );
}

/** Hero: video grande del screen share activo, con el presentador abajo. */
function HeroScreen({
  participant,
  screenStream,
  isLocal,
}: {
  participant: Participant;
  screenStream: MediaStream | null;
  isLocal: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !screenStream) return;
    el.srcObject = screenStream;
    el.play().catch((err) => console.warn('No se pudo reproducir hero screen share:', err));
    return () => { if (el) el.srcObject = null; };
  }, [screenStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative h-full min-h-[280px] w-full overflow-hidden rounded-contenedor bg-black"
    >
      {screenStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-white/70">
          <Medidor segmentos={0} />
          <span className="flex items-center gap-2">
            <Monitor size={20} aria-hidden="true" />
            Cargando pantalla…
          </span>
        </div>
      )}
      <ChipEstado icono={Monitor} className="absolute left-3 top-3 !bg-superficie !text-texto">
        Compartiendo pantalla
      </ChipEstado>
      {/* Pie con el presentador */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-black/75 px-4 py-3">
        <img
          src={participant.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.uid}`}
          alt={participant.displayName}
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-full border-2 border-white/30"
        />
        <span className="text-sm font-semibold text-white">{participant.displayName}</span>
      </div>
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
  // Sistema de solicitud de screen share
  const [incomingShareRequest, setIncomingShareRequest] = useState<{ fromUid: string; fromName: string } | null>(null);
  const [outgoingShareRequest, setOutgoingShareRequest] = useState(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(false);

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
  // sharingScreenRef: fuente de verdad del último broadcast enviado. El effect
  // de sincronización abajo (basado en localScreenStream) lo actualiza y
  // broadcastea cuando difiere, cubriendo el toggle manual, el botón nativo
  // del navegador (track.onended) y el cleanup al salir, en un solo lugar.
  const sharingScreenRef = useRef<boolean>(false);
  // Mirror ref de incomingShareRequest para leerlo dentro de closures de broadcast
  // (el state no se lee fresco dentro del handler registrado en el effect).
  const incomingShareRequestRef = useRef<{ fromUid: string; fromName: string } | null>(null);
  const shareRequestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const {
    localStream,
    remoteStreams,
    initiateCall,
    localScreenStream,
    remoteScreenStreams,
    startScreenShare,
    stopScreenShare,
    peerConnectionStates,
  } = useWebRTC(callId, userProfile.uid, channel, peerUidsKey);

  // UID del participante que está compartiendo pantalla (o null). Se usa para
  // condicionar el hero layout y bloquear nuevos shares sin solicitud.
  const activeSharer = useMemo(() => {
    if (localScreenStream) return userProfile.uid;
    return Object.values(participants).find(p => p.isSharingScreen)?.uid ?? null;
  }, [participants, localScreenStream, userProfile.uid]);

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
      sharingScreenRef.current = false;
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
            isSharingScreen: sharingScreenRef.current,
          },
        });
      }
    });

    // Broadcast: estado dinámico de cada peer. Sin acumulación porque
    // broadcast no persiste — cada mensaje es independiente y sustituye
    // el estado anterior en nuestro local participants[uid].
    ch.on('broadcast', { event: 'peer-state' }, ({ payload }) => {
      const { uid, mood, isMuted, isSharingScreen } = payload as {
        uid: string;
        mood: Mood;
        isMuted: boolean;
        isSharingScreen?: boolean;
      };
      // Solo aplicamos para peers remotos. Nuestro propio estado lo
      // controlamos localmente con isMuted/currentMood/sharingScreenRef.
      if (uid === userProfile.uid) return;
      setParticipants(prev => {
        if (!prev[uid]) return prev; // todavía no tenemos su presence
        return {
          ...prev,
          [uid]: { ...prev[uid], mood, isMuted, isSharingScreen: !!isSharingScreen },
        };
      });
    });

    // Broadcast: solicitud de screen share — solo la procesa el presentador actual.
    ch.on('broadcast', { event: 'screen-share-request' }, ({ payload }) => {
      const { fromUid, fromName } = payload as { fromUid: string; fromName: string };
      if (!sharingScreenRef.current) return; // no soy el presentador

      // Si ya tengo una solicitud pendiente → denegar inmediatamente la nueva.
      if (incomingShareRequestRef.current) {
        ch.send({
          type: 'broadcast',
          event: 'screen-share-response',
          payload: { toUid: fromUid, accepted: false },
        });
        return;
      }

      incomingShareRequestRef.current = { fromUid, fromName };
      setIncomingShareRequest({ fromUid, fromName });
      if (shareRequestTimerRef.current) clearTimeout(shareRequestTimerRef.current);
      shareRequestTimerRef.current = setTimeout(() => {
        incomingShareRequestRef.current = null;
        setIncomingShareRequest(null);
        ch.send({
          type: 'broadcast',
          event: 'screen-share-response',
          payload: { toUid: fromUid, accepted: false },
        });
      }, 15000);
    });

    // Broadcast: respuesta a solicitud de screen share — solo la procesa el solicitante.
    ch.on('broadcast', { event: 'screen-share-response' }, ({ payload }) => {
      const { toUid, accepted } = payload as { toUid: string; accepted: boolean };
      if (toUid !== userProfile.uid) return;
      setOutgoingShareRequest(false);
      if (accepted) {
        setPendingAutoStart(true);
      } else {
        setToast('Solicitud denegada');
        setTimeout(() => setToast(null), 2500);
      }
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
      // Si tenemos mood/isMuted/isSharingScreen activos (reconexión),
      // broadcastearlos para que los peers existentes nos vean con el estado
      // correcto.
      if (moodRef.current !== 'none' || mutedRef.current || sharingScreenRef.current) {
        ch.send({
          type: 'broadcast',
          event: 'peer-state',
          payload: {
            uid: userProfile.uid,
            mood: moodRef.current,
            isMuted: mutedRef.current,
            isSharingScreen: sharingScreenRef.current,
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
      if (shareRequestTimerRef.current) {
        clearTimeout(shareRequestTimerRef.current);
        shareRequestTimerRef.current = null;
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
        isSharingScreen: sharingScreenRef.current,
      },
    });
  }, [isMuted, userProfile.uid]);

  // 5c. Sync de screen share local → broadcast. Guarda anti-loop: solo emite
  // si el valor derivado de localScreenStream difiere del último ref enviado.
  // Unifica los 3 caminos por los que isSharingScreen puede cambiar:
  // toggle manual, botón nativo del navegador (track.onended) y cleanup.
  useEffect(() => {
    const newValue = !!localScreenStream;
    if (sharingScreenRef.current === newValue) return;
    sharingScreenRef.current = newValue;
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({
      type: 'broadcast',
      event: 'peer-state',
      payload: {
        uid: userProfile.uid,
        mood: moodRef.current,
        isMuted: mutedRef.current,
        isSharingScreen: newValue,
      },
    });
  }, [localScreenStream, userProfile.uid]);

  // 6. Atajos de teclado.
  useEffect(() => {
    // Atajos de una sola tecla (WCAG 2.1.4): no actúan al escribir en un campo ni con una capa abierta
    // (modal o panel); la capa abierta cierra con su propio Escape.
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'm' && !e.repeat) setIsMuted(prev => !prev);
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]:not([inert]), [role="alertdialog"][aria-modal="true"]')) return;
        onLeave();
      }
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
          isSharingScreen: sharingScreenRef.current,
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

  const handleToggleScreenShare = useCallback(async () => {
    // Si ya estoy compartiendo → parar.
    if (sharingScreenRef.current) {
      await stopScreenShare();
      return;
    }
    // Si alguien más está compartiendo → enviar solicitud en vez de iniciar.
    if (activeSharer && activeSharer !== userProfile.uid) {
      if (outgoingShareRequest) return; // ya hay una solicitud pendiente
      setOutgoingShareRequest(true);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'screen-share-request',
        payload: { fromUid: userProfile.uid, fromName: userProfile.displayName },
      });
      return;
    }
    // Nadie comparte → iniciar directo.
    await startScreenShare();
  }, [startScreenShare, stopScreenShare, activeSharer, userProfile, outgoingShareRequest]);

  const handleAcceptShareRequest = useCallback(async () => {
    if (!incomingShareRequest) return;
    const requesterUid = incomingShareRequest.fromUid;
    incomingShareRequestRef.current = null;
    setIncomingShareRequest(null);
    if (shareRequestTimerRef.current) {
      clearTimeout(shareRequestTimerRef.current);
      shareRequestTimerRef.current = null;
    }
    // Parar mi share primero
    await stopScreenShare();
    // Notificar al solicitante que puede arrancar
    channelRef.current?.send({
      type: 'broadcast',
      event: 'screen-share-response',
      payload: { toUid: requesterUid, accepted: true },
    });
  }, [incomingShareRequest, stopScreenShare]);

  const handleDenyShareRequest = useCallback(() => {
    if (!incomingShareRequest) return;
    const requesterUid = incomingShareRequest.fromUid;
    incomingShareRequestRef.current = null;
    setIncomingShareRequest(null);
    if (shareRequestTimerRef.current) {
      clearTimeout(shareRequestTimerRef.current);
      shareRequestTimerRef.current = null;
    }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'screen-share-response',
      payload: { toUid: requesterUid, accepted: false },
    });
  }, [incomingShareRequest]);

  // Effect: pendingAutoStart reactivo — arranca screen share cuando el slot se libera
  // tras aceptación explícita del presentador anterior.
  useEffect(() => {
    if (pendingAutoStart && !activeSharer) {
      setPendingAutoStart(false);
      startScreenShare();
    }
  }, [pendingAutoStart, activeSharer, startScreenShare]);

  // Effect: limpiar solicitud saliente si el slot se libera sin aceptación.
  // El presentador paró de compartir naturalmente → no auto-iniciar.
  useEffect(() => {
    if (outgoingShareRequest && !activeSharer) {
      setOutgoingShareRequest(false);
    }
  }, [outgoingShareRequest, activeSharer]);

  // Effect: limpiar solicitud entrante si el solicitante sale de la llamada.
  useEffect(() => {
    if (incomingShareRequest && !participants[incomingShareRequest.fromUid]) {
      incomingShareRequestRef.current = null;
      setIncomingShareRequest(null);
      if (shareRequestTimerRef.current) {
        clearTimeout(shareRequestTimerRef.current);
        shareRequestTimerRef.current = null;
      }
    }
  }, [incomingShareRequest, participants]);

  // Capa de UI (no toca WebRTC ni la señalización): permiso del micrófono, modal accesible y popover de ánimo
  const { sinMicro } = usePermisoMicro(localStream);
  const reducirMovimiento = useReducedMotion();
  const [moodOpen, setMoodOpen] = useState(false);
  const modalSalirRef = useRef<HTMLDivElement>(null);
  const cancelarSalirRef = useRef<HTMLButtonElement>(null);
  useDialogo({
    ref: modalSalirRef,
    abierto: showLeaveModal,
    onCerrar: () => setShowLeaveModal(false),
    focoInicial: cancelarSalirRef,
  });
  // Escape cierra el popover de ánimo
  useEffect(() => {
    if (!moodOpen) return;
    // Detiene la propagación para que el atajo global de Escape (en window) no saque de la llamada.
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMoodOpen(false);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [moodOpen]);

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

  const esCreador = userProfile.uid === creatorId;
  const nParticipantes = Object.keys(participants).length;

  const textoCompartir = !canShareScreen
    ? 'No disponible'
    : localScreenStream
      ? 'Compartiendo'
      : outgoingShareRequest
        ? 'Solicitando...'
        : activeSharer
          ? 'Solicitar'
          : 'Compartir';

  // Teclas de la consola: 64 px en escritorio; 56 px con el texto debajo en móvil
  const claseTecla = 'flex-1 max-md:min-h-14 max-md:min-w-0 max-md:flex-col max-md:gap-1 max-md:!rounded-[1.75rem] max-md:px-2 max-md:text-xs md:flex-none';

  const grupoAnimo = (
    <div role="group" aria-label="Tu ánimo" className="flex items-center gap-1">
      {MOODS.map((m) => {
        const activo = currentMood === m.type;
        return (
          <button
            key={m.type}
            type="button"
            onClick={() => handleMoodSelect(m.type)}
            aria-pressed={activo}
            aria-label={`Sentirse ${m.label}`}
            title={m.label}
            className={cn(
              'grid h-11 w-11 place-items-center rounded-control border-2 text-2xl transition-colors',
              activo ? 'border-accion-tinta bg-accion-suave' : 'border-transparent hover:bg-fondo'
            )}
          >
            <span aria-hidden="true">{m.emoji}</span>
          </button>
        );
      })}
    </div>
  );

  const listaParticipantes = (compact: boolean) =>
    Object.values(participants).map((p: Participant) => {
      const display: Participant = p.uid === userProfile.uid
        ? { ...p, mood: currentMood, isMuted, isSharingScreen: !!localScreenStream }
        : p;
      return (
        <ParticipantCard
          key={p.uid}
          participant={display}
          stream={p.uid === userProfile.uid ? localStream : remoteStreams[p.uid]}
          screenStream={compact ? undefined : p.uid === userProfile.uid ? localScreenStream : remoteScreenStreams[p.uid]}
          isLocal={p.uid === userProfile.uid}
          volume={localVolumes[p.uid]}
          onVolumeChange={(v) => handleVolumeChange(p.uid, v)}
          isMutedByListener={localMuted[p.uid] ?? false}
          onToggleListenerMute={() => handleToggleListenerMute(p.uid)}
          friendRelation={friendRelationOf(p.uid)}
          onSendFriendRequest={() => handleSendFriendRequest(p.uid)}
          friendRequestPending={friendRequestPending.has(p.uid)}
          connectionState={peerConnectionStates[p.uid]}
          compact={compact}
        />
      );
    });

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <AnimatePresence>
        {showLeaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="velo fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              ref={modalSalirRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="titulo-salir"
              aria-describedby="texto-salir"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="card w-full max-w-md space-y-6 p-6 sm:p-8"
            >
              <div className="flex flex-col items-center space-y-4 text-center">
                <AlertCircle size={32} className="text-peligro-tinta" aria-hidden="true" />
                <div className="space-y-2">
                  <h2 id="titulo-salir" className="text-2xl font-bold">¿Terminar comunicación?</h2>
                  <p id="texto-salir" className="text-texto-secundario">Eres el creador de esta sala. Puedes salirte tú solo o terminar la llamada para todos los participantes.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Boton variante="peligro" tamano="lg" onClick={handleEndCallForAll} cargando={isEndingCall} className="w-full">
                  {isEndingCall ? 'Terminando...' : 'Terminar para todos'}
                </Boton>
                <Boton variante="secundario" tamano="lg" onClick={onLeave} className="w-full">
                  Solo salirme yo
                </Boton>
                <Boton ref={cancelarSalirRef} variante="terciario" onClick={() => setShowLeaveModal(false)} className="w-full">
                  Cancelar
                </Boton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col px-4 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold sm:text-2xl">{callName}</h1>
            <p className="flex items-center gap-2 text-sm text-texto-secundario">
              <Medidor segmentos={Math.min(5, nParticipantes)} mini />
              {nParticipantes} participantes conectados
            </p>
          </div>
          <div className="relative flex flex-none items-center gap-1">
            {callVisibility === 'private' && callInviteCode && (
              <Boton
                variante="plano"
                onClick={async () => {
                  const base = import.meta.env.BASE_URL || '/';
                  const link = `${window.location.origin}${base}?invite=${callInviteCode}`;
                  await navigator.clipboard.writeText(link);
                  showToast('Link de invitación copiado');
                }}
                aria-label="Copiar link de invitación"
                title="Copiar link de invitación"
              >
                <LinkIcon size={20} aria-hidden="true" />
              </Boton>
            )}
            <Boton
              variante="plano"
              onClick={() => setChatOpen((v) => !v)}
              aria-label={unreadChat > 0 ? `Chat de la llamada, ${unreadChat} sin leer` : 'Chat de la llamada'}
              aria-expanded={chatOpen}
              aria-haspopup="dialog"
              title="Chat"
              className="relative max-md:hidden"
            >
              <MessageSquare size={20} aria-hidden="true" />
              <span>Chat</span>
              {unreadChat > 0 && (
                <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-xs font-bold text-sobre-peligro">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </Boton>
            <Boton
              variante="peligro"
              onClick={handleLeaveClick}
              aria-label={esCreador ? 'Terminar comunicación (Esc)' : 'Salir de la comunicación (Esc)'}
              className="max-sm:!w-12 max-sm:!px-0"
            >
              <PhoneOff size={20} aria-hidden="true" />
              <span className="max-sm:hidden">{esCreador ? 'Terminar' : 'Salir'}</span>
            </Boton>

            {/* Toast de confirmación — sale debajo de los botones */}
            <div role="status" aria-live="polite" className="absolute right-0 top-full z-[60] mt-2">
              <AnimatePresence>
                {toast && (
                  <motion.div
                    key={toast}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                    className="flex items-center gap-2 whitespace-nowrap rounded-contenedor border border-separador bg-superficie px-4 py-2.5 text-sm font-medium"
                  >
                    <Check size={16} className="flex-shrink-0 text-exito" aria-hidden="true" />
                    {toast}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {sinMicro && (
          <MensajeError icono={MicOff} className="mb-4">
            KallIt no tiene acceso a tu micrófono: los demás no te escuchan. Permítelo desde el candado de la barra de direcciones y vuelve a entrar a la sala.
          </MensajeError>
        )}

        {activeSharer ? (
          /* ─── Hero layout: screen share en primer plano + barra lateral compacta ─── */
          <main className="flex flex-1 flex-col gap-4 md:flex-row">
            {/* Hero: video grande */}
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait">
                {(() => {
                  const sharerP = participants[activeSharer];
                  if (!sharerP) return null;
                  const displaySharer: Participant = activeSharer === userProfile.uid
                    ? { ...sharerP, mood: currentMood, isMuted, isSharingScreen: true }
                    : sharerP;
                  return (
                    <HeroScreen
                      key={activeSharer}
                      participant={displaySharer}
                      screenStream={activeSharer === userProfile.uid ? localScreenStream : remoteScreenStreams[activeSharer]}
                      isLocal={activeSharer === userProfile.uid}
                    />
                  );
                })()}
              </AnimatePresence>
            </div>
            {/* Barra lateral: participantes (scroll propio) */}
            <div className="scrollbar-thin flex snap-x snap-mandatory flex-row gap-3 overflow-x-auto p-1.5 md:max-h-[calc(100dvh-13rem)] md:w-72 md:flex-col md:snap-none md:overflow-y-auto md:overflow-x-hidden">
              <AnimatePresence>{listaParticipantes(true)}</AnimatePresence>
            </div>
          </main>
        ) : (
          /* ─── Rejilla: nadie comparte pantalla ─── */
          <main className="grid flex-1 grid-cols-2 content-center justify-center gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(200px,320px))]">
            <AnimatePresence>{listaParticipantes(false)}</AnimatePresence>
          </main>
        )}
      </div>

      {/* Consola: una sola fila de controles, también en modo hero */}
      <footer className="sticky bottom-0 z-30 mt-4 rounded-t-contenedor bg-fondo-alterno px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        <div className="mx-auto flex max-w-[90rem] items-start justify-between gap-3 md:items-center md:gap-6">
          <div className="flex flex-1 items-start gap-3 md:flex-none md:items-center">
            <Boton
              variante="secundario"
              tamano="tecla"
              onClick={() => setIsMuted((prev) => !prev)}
              disabled={sinMicro}
              data-hundido={isMuted || sinMicro ? 'true' : undefined}
              aria-pressed={isMuted}
              aria-label={sinMicro ? 'Sin micrófono' : isMuted ? 'Activar micrófono (M)' : 'Silenciar micrófono (M)'}
              title={isMuted ? 'Activar micrófono (M)' : 'Silenciar (M)'}
              className={cn(
                claseTecla,
                isMuted && !sinMicro && '!border-peligro-tinta [--cara:var(--peligro-suave)] [--cara-hover:var(--peligro-suave)] [--tinta:var(--peligro-tinta)]'
              )}
            >
              {isMuted || sinMicro ? <MicOff size={24} aria-hidden="true" /> : <Mic size={24} aria-hidden="true" />}
              <span>{sinMicro ? 'Sin micrófono' : isMuted ? 'Silenciado' : 'Micro abierto'}</span>
            </Boton>

            <div className="relative flex flex-1 md:flex-none">
              <Boton
                variante="secundario"
                tamano="tecla"
                onClick={handleToggleScreenShare}
                disabled={outgoingShareRequest || !canShareScreen}
                data-hundido={localScreenStream || outgoingShareRequest || !canShareScreen ? 'true' : undefined}
                aria-pressed={!!localScreenStream}
                aria-label={
                  !canShareScreen ? 'Compartir pantalla no disponible en este navegador'
                    : localScreenStream ? 'Detener compartir pantalla'
                      : outgoingShareRequest ? 'Solicitando...'
                        : activeSharer ? 'Solicitar compartir pantalla'
                          : 'Compartir pantalla'
                }
                title={
                  !canShareScreen ? 'Compartir pantalla no está disponible en este navegador (típico de móviles)'
                    : localScreenStream ? 'Detener compartir pantalla'
                      : outgoingShareRequest ? 'Esperando respuesta...'
                        : activeSharer ? 'Solicitar compartir pantalla'
                          : 'Compartir pantalla'
                }
                className={cn(
                  claseTecla,
                  'w-full md:w-auto',
                  localScreenStream && '[--cara:var(--accion-suave)] [--cara-hover:var(--accion-suave)] !border-accion-tinta'
                )}
              >
                {localScreenStream ? <MonitorOff size={24} aria-hidden="true" /> : outgoingShareRequest ? <Clock size={24} aria-hidden="true" /> : <Monitor size={24} aria-hidden="true" />}
                <span>{textoCompartir}</span>
              </Boton>
              {localScreenStream && (
                <ChipEstado tono="accion" className="pointer-events-none absolute -top-2 right-1 !min-h-5 !px-2 !text-xs">
                  En vivo
                </ChipEstado>
              )}
            </div>

            {/* Chat: en móvil vive en la consola (en escritorio, en la cabecera) */}
            <Boton
              variante="secundario"
              tamano="tecla"
              onClick={() => setChatOpen((v) => !v)}
              aria-label={unreadChat > 0 ? `Chat de la llamada, ${unreadChat} sin leer` : 'Chat de la llamada'}
              aria-expanded={chatOpen}
              aria-haspopup="dialog"
              className={cn(claseTecla, 'relative md:hidden')}
            >
              <MessageSquare size={24} aria-hidden="true" />
              <span>Chat</span>
              {unreadChat > 0 && (
                <span aria-hidden="true" className="absolute right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-xs font-bold text-sobre-peligro">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </Boton>

            {/* Ánimo en móvil: popover con los seis emojis */}
            <div className="relative flex flex-1 md:hidden">
              <Boton
                variante="secundario"
                tamano="tecla"
                onClick={() => setMoodOpen((v) => !v)}
                aria-expanded={moodOpen}
                aria-haspopup="true"
                aria-label="Tu ánimo"
                className={cn(claseTecla, 'w-full')}
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {MOODS.find((m) => m.type === currentMood)?.emoji ?? '🙂'}
                </span>
                <span>Ánimo</span>
              </Boton>
              {moodOpen && (
                <div className="absolute bottom-full right-0 z-40 mb-3 rounded-contenedor border border-separador bg-superficie p-2">
                  {grupoAnimo}
                </div>
              )}
            </div>
          </div>

          <div className="max-md:hidden rounded-contenedor bg-fondo p-1.5">{grupoAnimo}</div>

          <p className="hidden text-sm text-texto-secundario lg:block">
            Atajos: <strong>M</strong> para micro, <strong>Esc</strong> para salir
          </p>
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

      {/* Popup de solicitud entrante de screen share */}
      <AnimatePresence>
        {incomingShareRequest && (
          <motion.div
            role="alertdialog"
            aria-labelledby="titulo-solicitud"
            aria-describedby="texto-solicitud"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="card fixed bottom-28 right-4 z-50 max-w-sm space-y-4 border border-separador p-5 sm:right-6"
          >
            <div className="flex items-center gap-3">
              <Monitor size={24} className="flex-none text-accion-tinta" aria-hidden="true" />
              <div>
                <p id="titulo-solicitud" className="font-semibold">Solicitud de pantalla</p>
                <p id="texto-solicitud" className="text-sm text-texto-secundario">
                  <span className="font-semibold">{incomingShareRequest.fromName}</span> quiere compartir pantalla
                </p>
              </div>
            </div>
            {/* Barra de 15 s (con movimiento reducido queda fija y se dice con texto) */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-fondo-alterno">
              {reducirMovimiento ? (
                <div className="h-full w-full rounded-full bg-accion" />
              ) : (
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 15, ease: 'linear' }}
                  className="h-full rounded-full bg-accion"
                />
              )}
            </div>
            {reducirMovimiento && <p className="text-sm text-texto-secundario">Responde en 15 s</p>}
            <div className="flex gap-3">
              <Boton onClick={handleAcceptShareRequest} className="flex-1">
                Aceptar
              </Boton>
              <Boton variante="secundario" onClick={handleDenyShareRequest} className="flex-1">
                Denegar
              </Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
