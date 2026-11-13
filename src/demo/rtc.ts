import { useMemo, useState } from 'react';
import type { useWebRTC } from '../hooks/useWebRTC';
import { nivelesSimulados } from './modo';
import { nivelDeVoz } from './voz';

/**
 * Flujo «de mentira» con un generador de nivel asociado: sin micrófono, sin red y sin audio real. No es un
 * MediaStream (hay navegadores sin esa clase); `useAudioLevel` lo reconoce por el registro y `CallRoom` no
 * lo conecta a ningún <audio>.
 */
function flujoSimulado(nivel: (ahora: number, reducido: boolean) => number): MediaStream {
  const flujo = { getAudioTracks: () => [], getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
  nivelesSimulados.set(flujo, nivel);
  return flujo;
}

/**
 * Sustituye a `useWebRTC` solo en la demo: no pide micrófono, no abre conexiones y no señaliza.
 * Las personas de ejemplo «hablan» con niveles simulados (`voz.ts`); compartir pantalla no está disponible.
 */
export function useRtcDemo(
  _callId: string | null,
  userId: string | null,
  _channel: unknown,
  peerUidsKey: string
): ReturnType<typeof useWebRTC> {
  const [localStream] = useState(() => flujoSimulado(() => 0));
  const remoteStreams = useMemo(() => {
    const uids = peerUidsKey.split(',').filter((u) => u && u !== userId);
    return Object.fromEntries(uids.map((uid, i) => [uid, flujoSimulado((t, r) => nivelDeVoz(i, t, r))]));
  }, [peerUidsKey, userId]);

  return {
    localStream,
    remoteStreams,
    initiateCall: async () => {},
    localScreenStream: null,
    remoteScreenStreams: {},
    startScreenShare: async () => {},
    stopScreenShare: async () => {},
    peerConnectionStates: {},
  };
}
