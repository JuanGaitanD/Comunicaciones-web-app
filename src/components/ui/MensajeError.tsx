import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Bloque de error con token negativo, icono y texto (nunca solo color). */
export default function MensajeError({
  children,
  icono: Icono = AlertCircle,
  id,
  className,
}: {
  children: ReactNode;
  icono?: LucideIcon;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-control bg-peligro-suave p-3 text-sm font-medium text-peligro-tinta',
        className
      )}
    >
      <Icono size={20} className="mt-px flex-none" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
