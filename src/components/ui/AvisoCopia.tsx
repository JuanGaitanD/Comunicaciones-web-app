import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import Boton from './Boton';
import Campo from './Campo';

/**
 * Aviso de «no se pudo copiar el enlace»: ofrece el enlace para copiarlo a mano. La región `role="status"`
 * existe siempre (así los lectores de pantalla anuncian el aviso cuando aparece); el contenido solo si
 * `enlace` tiene valor.
 */
export default function AvisoCopia({ enlace, onCerrar, className }: { enlace: string | null; onCerrar: () => void; className?: string }) {
  const id = useId();
  return (
    <div role="status" aria-live="polite" className={className}>
      {enlace && (
        <div className={cn('card flex flex-col gap-3 p-4')}>
          <p className="flex items-start gap-2 text-sm font-medium text-aviso">
            <AlertCircle size={20} className="mt-px flex-none" aria-hidden="true" />
            No se pudo copiar el enlace de invitación. Cópialo a mano:
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
      )}
    </div>
  );
}
