import { useState } from 'react';
import { useWebRTC } from './useWebRTC';
import { demoActiva } from '../demo/modo';

/**
 * Elige una sola vez por montaje entre el WebRTC real (modo normal, sin cambios) y el simulado de la demo,
 * que no pide micrófono ni abre conexiones. El modo no cambia mientras la sala está abierta (salir de la
 * demo desmonta la sala), así que el orden de los hooks es siempre el mismo.
 */
export function useRtc(...args: Parameters<typeof useWebRTC>): ReturnType<typeof useWebRTC> {
  const [demo] = useState(() => demoActiva());
  return demo ? demo.useRtc(...args) : useWebRTC(...args);
}
