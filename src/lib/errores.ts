export const TEXTO_SIN_SERVIDOR =
  'No pudimos conectar con el servidor de KallIt (puede estar en pausa). Puedes recorrer la app con «Probar la demo» (datos de ejemplo).';

/** Detecta el fallo de red de fetch (backend pausado, sin conexión) con sus variantes por navegador. */
export function esErrorDeRed(err: unknown): boolean {
  const e = err as { message?: string; name?: string } | null | undefined;
  if (!e) return false;
  if (e.name === 'AuthRetryableFetchError') return true;
  const mensaje = e.message ?? '';
  return /failed to fetch|networkerror|load failed|network request failed/i.test(mensaje);
}

/** Mensaje para la persona: en español si es de red; si no, el del propio backend como hasta ahora. */
export function mensajeDeError(err: unknown): string {
  if (esErrorDeRed(err)) return TEXTO_SIN_SERVIDOR;
  const e = err as { message?: string } | null | undefined;
  return e?.message ?? String(err);
}

/**
 * ¿Responde el servidor? Una petición mínima a su endpoint de salud, con tope de 4 s. Solo importa si hay
 * red hasta el host (`no-cors`: la respuesta es opaca; un fallo de DNS o de conexión rechaza la promesa).
 * Sirve para no sacar a la persona de la app hacia un host que no existe (p. ej. con el backend en pausa).
 */
export async function servidorResponde(): Promise<boolean> {
  const corte = new AbortController();
  const id = setTimeout(() => corte.abort(), 4000);
  try {
    const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    await fetch(`${base}/auth/v1/health`, { mode: 'no-cors', cache: 'no-store', signal: corte.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}
