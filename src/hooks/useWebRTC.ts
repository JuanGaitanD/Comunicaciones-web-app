import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Signal =
  | { from: string; to: string; type: 'offer'; data: string }
  | { from: string; to: string; type: 'answer'; data: string }
  | { from: string; to: string; type: 'candidate'; data: string };

// STUN solo basta cuando ambos peers están detrás de NAT permisivo. En LatAm
// (y muchas redes corporativas/hoteles) el NAT es simétrico y los paquetes
// nunca se encuentran sin un relay TURN. Las credenciales se leen en build
// time desde import.meta.env; si faltan se cae a STUN-only y se avisa por
// consola para que sea visible en dev.
function buildIceServers(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUrlTls = import.meta.env.VITE_TURN_URL_TLS;
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    const urls = turnUrlTls ? [turnUrl, turnUrlTls] : [turnUrl];
    servers.push({ urls, username, credential });
  } else {
    console.warn(
      'TURN no configurado: las llamadas entre redes restrictivas pueden quedarse sin audio.'
    );
  }
  return { iceServers: servers };
}

export function useWebRTC(
  callId: string | null,
  userId: string | null,
  channel: RealtimeChannel | null,
  // Clave estable (uids ordenados unidos por coma) de los participantes vivos.
  // Se usa para cerrar PeerConnections cuando un peer sale. Es string (no array)
  // para evitar re-disparos por identidad: solo cambia si entra/sale alguien.
  peerUidsKey: string
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [uid: string]: MediaStream }>({});
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<{ [uid: string]: MediaStream }>({});
  const [peerConnectionStates, setPeerConnectionStates] = useState<{
    [uid: string]: RTCPeerConnectionState;
  }>({});
  const peerConnections = useRef<{ [uid: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Refs por peer: el RTCRtpSender retornado por addTrack(videoTrack). Necesario
  // para llamar removeTrack al detener el screen share.
  const videoSendersRef = useRef<{ [uid: string]: RTCRtpSender }>({});

  // Capturar localStream una vez por llamada.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        console.error('Error accediendo al micrófono:', err);
      }
    })();
    return () => {
      cancelled = true;
      // Liberar screen stream antes que audio para evitar quedar con stream
      // colgante si el usuario sale mientras comparte.
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      videoSendersRef.current = {};
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setRemoteScreenStreams({});
      setPeerConnectionStates({});
      setLocalStream(null);
      setLocalScreenStream(null);
    };
  }, [callId]);

  // Cuando un peer desaparece de la lista de participantes vivos, cerrar
  // su RTCPeerConnection y eliminar su MediaStream remoto. Sin esto, cerrar
  // una pestaña dejaría la tarjeta del peer y su conexión vivas en la otra.
  useEffect(() => {
    const alive = new Set(peerUidsKey ? peerUidsKey.split(',').filter(Boolean) : []);
    const toRemove: string[] = [];
    for (const uid of Object.keys(peerConnections.current)) {
      if (!alive.has(uid)) toRemove.push(uid);
    }
    if (toRemove.length === 0) return;
    for (const uid of toRemove) {
      peerConnections.current[uid].close();
      delete peerConnections.current[uid];
      delete videoSendersRef.current[uid];
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      for (const uid of toRemove) delete next[uid];
      return next;
    });
    setRemoteScreenStreams((prev) => {
      const next = { ...prev };
      for (const uid of toRemove) delete next[uid];
      return next;
    });
    setPeerConnectionStates((prev) => {
      const next = { ...prev };
      for (const uid of toRemove) delete next[uid];
      return next;
    });
  }, [peerUidsKey]);

  const sendSignal = useCallback(
    (signal: Signal) => {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'signal', payload: signal });
    },
    [channel]
  );

  const createPeerConnection = useCallback(
    (peerUid: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(buildIceServers());

      pc.onicecandidate = (event) => {
        if (event.candidate && userId) {
          sendSignal({
            from: userId,
            to: peerUid,
            type: 'candidate',
            data: JSON.stringify(event.candidate),
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
          // Audio: usar event.streams[0] funciona porque viene del getUserMedia
          // original donde el stream se preserva a través del addTrack inicial.
          if (event.streams.length > 0) {
            setRemoteStreams((prev) => ({ ...prev, [peerUid]: event.streams[0] }));
          }
        } else if (event.track.kind === 'video') {
          // Video: envolver el track en un MediaStream nuevo. event.streams[0]
          // es inconsistente entre Chrome/Safari/Firefox cuando la pista se
          // agrega dinámicamente con addTrack después de crear la PC.
          const newStream = new MediaStream([event.track]);
          setRemoteScreenStreams((prev) => ({ ...prev, [peerUid]: newStream }));
          // Cuando el peer detiene el share, su track local emite 'ended' y la
          // pista remota cambia a estado mute. Para limpiar la UI usamos onended.
          event.track.onended = () => {
            setRemoteScreenStreams((prev) => {
              const next = { ...prev };
              delete next[peerUid];
              return next;
            });
          };
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerConnectionStates((prev) => ({ ...prev, [peerUid]: pc.connectionState }));
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerUid];
            return next;
          });
          setRemoteScreenStreams((prev) => {
            const next = { ...prev };
            delete next[peerUid];
            return next;
          });
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Si el usuario ya está compartiendo pantalla cuando llega un peer nuevo,
      // agregar también la pista de video para que la vea desde el inicio.
      // La renegociación natural del setup de PC se encarga del SDP.
      if (screenStreamRef.current) {
        const videoTrack = screenStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const sender = pc.addTrack(videoTrack, screenStreamRef.current);
          videoSendersRef.current[peerUid] = sender;
        }
      }

      peerConnections.current[peerUid] = pc;
      return pc;
    },
    [userId, sendSignal]
  );

  const handleSignal = useCallback(
    async (signal: Signal) => {
      if (!userId || signal.to !== userId) return;

      let pc = peerConnections.current[signal.from];
      if (!pc) pc = createPeerConnection(signal.from);

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.data)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({
            from: userId,
            to: signal.from,
            type: 'answer',
            data: JSON.stringify(answer),
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.data)));
        } else if (signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.data)));
        }
      } catch (err) {
        console.warn('Error procesando señal WebRTC:', err);
      }
    },
    [userId, createPeerConnection, sendSignal]
  );

  // Suscribirse al canal Broadcast para recibir señales.
  useEffect(() => {
    if (!channel || !userId) return;
    const handler = ({ payload }: { payload: Signal }) => {
      handleSignal(payload);
    };
    channel.on('broadcast', { event: 'signal' }, handler);
    // El cleanup del canal lo hace el dueño (CallRoom) al desmontar.
  }, [channel, userId, handleSignal]);

  const initiateCall = useCallback(
    async (targetUid: string) => {
      if (!userId || !localStreamRef.current) return;
      try {
        const pc = createPeerConnection(targetUid);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          from: userId,
          to: targetUid,
          type: 'offer',
          data: JSON.stringify(offer),
        });
      } catch (err) {
        console.error('Error iniciando llamada WebRTC:', err);
      }
    },
    [userId, createPeerConnection, sendSignal]
  );

  // Renegociación manual tras agregar/quitar tracks. Glare protection lite:
  // si la PC no está en 'stable', otra oferta ya está en vuelo y procesarla
  // crashea con InvalidStateError. La próxima señal volverá a stable y un
  // retry del usuario cubre el caso raro.
  const renegotiate = useCallback(
    async (peerUid: string, pc: RTCPeerConnection) => {
      if (!userId) return;
      if (pc.signalingState !== 'stable') {
        console.warn(`PC ${peerUid} no estable (${pc.signalingState}), salto renegociación`);
        return;
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          from: userId,
          to: peerUid,
          type: 'offer',
          data: JSON.stringify(offer),
        });
      } catch (err) {
        console.error('Error renegociando con', peerUid, err);
      }
    },
    [userId, sendSignal]
  );

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return;
    // Snapshot por si el cleanup llega mid-await.
    const stream = screenStreamRef.current;
    const senders = videoSendersRef.current;
    screenStreamRef.current = null;
    videoSendersRef.current = {};

    for (const [peerUid, pc] of Object.entries(peerConnections.current)) {
      const sender = senders[peerUid];
      if (sender) {
        try {
          pc.removeTrack(sender);
        } catch (err) {
          console.warn('removeTrack falló para', peerUid, err);
        }
        await renegotiate(peerUid, pc);
      }
    }

    stream.getTracks().forEach((t) => t.stop());
    setLocalScreenStream(null);
  }, [renegotiate]);

  const startScreenShare = useCallback(async () => {
    if (screenStreamRef.current) return; // ya activo
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Listener para el botón nativo "Detener uso compartido" del navegador.
      track.onended = () => {
        stopScreenShare();
      };

      screenStreamRef.current = stream;
      setLocalScreenStream(stream);

      for (const [peerUid, pc] of Object.entries(peerConnections.current)) {
        const sender = pc.addTrack(track, stream);
        videoSendersRef.current[peerUid] = sender;
        await renegotiate(peerUid, pc);
      }
    } catch (err) {
      // El usuario canceló el diálogo de selección o se denegó el permiso.
      // No es un error real — log a info nivel para diagnóstico.
      console.warn('Screen share cancelado o falló:', err);
    }
  }, [renegotiate, stopScreenShare]);

  return {
    localStream,
    remoteStreams,
    initiateCall,
    localScreenStream,
    remoteScreenStreams,
    startScreenShare,
    stopScreenShare,
    peerConnectionStates,
  };
}
