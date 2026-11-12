import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Interruptor `role="switch"` con la etiqueta visible asociada. */
export default function Interruptor({
  etiqueta,
  activo,
  onCambio,
  iconoActivo,
  iconoInactivo,
  className,
}: {
  etiqueta: string;
  activo: boolean;
  onCambio: (activo: boolean) => void;
  iconoActivo?: ReactNode;
  iconoInactivo?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <span id={id} className="font-medium">
        {etiqueta}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={id}
        onClick={() => onCambio(!activo)}
        className="interruptor"
      >
        <span className="interruptor-pulgar" aria-hidden="true">
          {activo ? iconoActivo : iconoInactivo}
        </span>
      </button>
    </div>
  );
}
