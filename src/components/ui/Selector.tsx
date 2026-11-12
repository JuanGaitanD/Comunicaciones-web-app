import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
}

/**
 * `<select>` nativo real (valor, onChange y teclado son los del navegador) con el control cerrado
 * dibujado. Donde el navegador lo admite (`appearance: base-select`) la lista también se dibuja;
 * en el resto queda la lista nativa como respaldo.
 */
export default function Selector({
  etiqueta,
  valor,
  opciones,
  onCambio,
  className,
}: {
  etiqueta: string;
  valor: string;
  opciones: OpcionSelector[];
  onCambio: (valor: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-texto-secundario">
        {etiqueta}
      </label>
      <div className="relative">
        <select id={id} className="selector" value={valor} onChange={(e) => onCambio(e.target.value)}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <ChevronDown
          size={20}
          className="pointer-events-none absolute right-3.5 top-[14px] select-none text-texto"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
