import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import Boton from './Boton';
import Campo from './Campo';

const MENSAJE = 'No se pudo copiar el enlace de invitación. Cópialo a mano:';

/**
 * Aviso de «no se pudo copiar el enlace»: ofrece el enlace para copiarlo a mano. Solo el mensaje se anuncia:
 * la región `role="status"` (siempre presente, para que se anuncie al aparecer) lleva solo el texto; el campo
 * y «Cerrar» quedan fuera. El texto visible no es una región viva, así que no se lee dos veces.
 */
export default function AvisoCopia({ enlace, onCerrar, className }: { enlace: string | null; onCerrar: () => void; className?: string }) {
  const id = useId();
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {enlace ? MENSAJE : ''}
      </div>
      {enlace && (
        <div className={className}>
          <div className="card flex flex-col gap-3 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-aviso">
              <AlertCircle size={20} className="mt-px flex-none" aria-hidden="true" />
              {MENSAJE}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Campo
                id={id}
                etiqueta="Enlace de invitación"
                readOnly
                value={enlace}
                onFocus={(e) => e.currentTarget.select()}
                claseContenedor="min-w-0 flex-1 basis-60"
              />
              <Boton variante="terciario" onClick={onCerrar}>
                Cerrar
              </Boton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
