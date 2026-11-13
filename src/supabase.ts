import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoActiva } from './demo/modo';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local. Ver docs/01-supabase-bootstrap.md.'
  );
}

const real = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Cliente que usa toda la app. Normalmente es el real, sin cambios. Solo mientras el modo demo está
 * activo (`src/demo/`), cada llamada va a un cliente simulado en memoria y nada sale a la red.
 * `removeChannel` reconoce los canales simulados por si la demo se apaga antes de limpiar un efecto.
 */
export const supabase = new Proxy(real, {
  get(_destino, propiedad) {
    const demo = demoActiva();
    if (propiedad === 'removeChannel') {
      return (canal: { __demo?: boolean; cerrar?: () => void }) =>
        canal?.__demo ? (canal.cerrar?.(), Promise.resolve('ok')) : real.removeChannel(canal as never);
    }
    const origen: any = demo ? demo.cliente : real;
    const valor = origen[propiedad];
    return typeof valor === 'function' ? valor.bind(origen) : valor;
  },
}) as SupabaseClient;
