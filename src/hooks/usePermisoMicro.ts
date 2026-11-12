import { useEffect, useState } from 'react';

type Permiso = PermissionState | 'desconocido';

const ESPERA_MS = 4000;

/**
 * Dice si la persona se quedó sin micrófono (permiso denegado o sin acceso), solo desde la capa de UI:
 * no toca `useWebRTC`. Usa la Permissions API cuando existe (Firefox no admite `microphone`: queda
 * «desconocido») y, además, considera «sin micrófono» que `localStream` siga `null` 4 s después de
 * entrar, salvo que el navegador esté todavía pidiendo permiso.
 */
export function usePermisoMicro(localStream: MediaStream | null) {
  const [permiso, setPermiso] = useState<Permiso>('desconocido');
  const [esperaAgotada, setEsperaAgotada] = useState(false);

  useEffect(() => {
    let estado: PermissionStatus | null = null;
    let vivo = true;
    const alCambiar = () => estado && vivo && setPermiso(estado.state);
    (async () => {
      try {
        estado = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (!vivo) return;
        setPermiso(estado.state);
        estado.onchange = alCambiar;
      } catch {
        setPermiso('desconocido');
      }
    })();
    return () => {
      vivo = false;
      if (estado) estado.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (localStream) {
      setEsperaAgotada(false);
      return;
    }
    const id = window.setTimeout(() => setEsperaAgotada(true), ESPERA_MS);
    return () => window.clearTimeout(id);
  }, [localStream]);

  const sinMicro = !localStream && (permiso === 'denied' || (permiso !== 'prompt' && esperaAgotada));
  return { permiso, sinMicro };
}
