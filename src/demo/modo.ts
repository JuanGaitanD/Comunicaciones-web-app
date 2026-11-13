import { useSyncExternalStore } from 'react';
import type { Demo } from './demo';

/**
 * Interruptor del modo demo. Es lo único de la demo que viaja en el paquete principal (unas decenas de
 * líneas): el cliente simulado, los datos y el simulador de llamada se cargan aparte, solo al pulsar
 * «Probar la demo». Con el modo apagado nada de esto se ejecuta y la app usa el Supabase real.
 */
const CLAVE = 'kallit-demo';
const oyentes = new Set<() => void>();
let demo: Demo | null = null;

const emitir = () => oyentes.forEach((f) => f());

/** Niveles de voz simulados por MediaStream (`useAudioLevel` los lee en lugar de analizar audio real). */
export const nivelesSimulados = new WeakMap<MediaStream, (ahora: number, reducido: boolean) => number>();

export const demoActiva = (): Demo | null => demo;

/** ¿Venía en demo antes de recargar? (sessionStorage: solo esta pestaña, nada viaja ni se guarda fuera.) */
export const demoGuardada = (): boolean => {
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
};

export async function entrarEnDemo(): Promise<void> {
  if (demo) return;
  const { crearDemo } = await import('./demo');
  demo = crearDemo(salirDeDemo);
  try {
    sessionStorage.setItem(CLAVE, '1');
  } catch {
    /* sin almacenamiento: la demo funciona igual, solo no sobrevive a recargar */
  }
  emitir();
}

export function salirDeDemo(): void {
  const actual = demo;
  demo = null;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
  actual?.cerrar();
  emitir();
}

/** Re-render cuando se entra o se sale de la demo. */
export function useDemoActiva(): boolean {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => demo !== null,
    () => false
  );
}
