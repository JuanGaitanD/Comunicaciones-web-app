export const TEXTO_SIN_SERVIDOR =
  'No pudimos conectar con el servidor de KallIt. La demo se activa bajo demanda y puede estar en pausa; inténtalo más tarde.';

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
