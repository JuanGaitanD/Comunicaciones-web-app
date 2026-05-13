import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Signal =
  | { from: string; to: string; type: 'offer'; data: string }
  | { from: string; to: string; type: 'answer'; data: string }
  | { from: string; to: string; type: 'candidate'; data: string };

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useWebRTC(
  callId: string | null,
  userId: string | null,
  channel: RealtimeChannel | null
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [uid: string]: MediaStream }>({});
  const peerConnections = useRef<{ [uid: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // Capturar localStream una vez por llamada.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setLocalStream(null);
    };
  }, [callId]);

  const sendSignal = useCallback(
    (signal: Signal) => {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'signal', payload: signal });
    },
    [channel]
  );

  const createPeerConnection = useCallback(
    (peerUid: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

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
        setRemoteStreams((prev) => ({ ...prev, [peerUid]: event.streams[0] }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
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
        try {
          await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.data)));
        } catch (err) {
          console.warn('Error añadiendo ICE candidate:', err);
        }
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
      const pc = createPeerConnection(targetUid);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        from: userId,
        to: targetUid,
        type: 'offer',
        data: JSON.stringify(offer),
      });
    },
    [userId, createPeerConnection, sendSignal]
  );

  return { localStream, remoteStreams, initiateCall };
}
