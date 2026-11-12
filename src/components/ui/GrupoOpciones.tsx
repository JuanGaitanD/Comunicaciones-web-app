import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface OpcionGrupo {
  valor: string;
  etiqueta: string;
  icono?: ReactNode;
  /** Muestra de color (variante `muestra`). */
  color?: string;
  /** Texto accesible cuando la etiqueta visible no existe o no basta. */
  nombreAccesible?: string;
  /** Id de un texto de apoyo asociado a la opción. */
  describedBy?: string;
}

/**
 * `<fieldset>` + radios nativos ocultos visualmente + etiqueta dibujada.
 * La opción elegida lleva marca `Check` y borde, no solo color.
 */
export default function GrupoOpciones({
  leyenda,
  leyendaOculta,
  nombre,
  valor,
  opciones,
  onCambio,
  variante = 'texto',
  llenar,
  className,
}: {
  leyenda: string;
  leyendaOculta?: boolean;
  nombre: string;
  valor: string;
  opciones: OpcionGrupo[];
  onCambio: (valor: string) => void;
  variante?: 'texto' | 'muestra';
  /** Las opciones reparten el ancho disponible. */
  llenar?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className={cn('mb-2 text-sm font-medium text-texto-secundario', leyendaOculta && 'sr-only')}>
        {leyenda}
      </legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={cn('opcion', variante === 'muestra' && 'opcion-muestra', llenar && 'flex-1')}
            style={variante === 'muestra' && o.color ? { backgroundColor: o.color } : undefined}
          >
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => onCambio(o.valor)}
              aria-label={o.nombreAccesible}
              aria-describedby={o.describedBy}
              className="sr-only"
            />
            {variante === 'texto' && (
              <>
                {o.icono}
                <span>{o.etiqueta}</span>
              </>
            )}
            <Check size={16} className="opcion-marca" aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
