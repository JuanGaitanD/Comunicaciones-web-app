import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const TONO = {
  neutro: '',
  accion: 'bg-accion-suave text-accion-tinta',
  aviso: 'text-aviso',
  peligro: 'bg-peligro-suave text-peligro-tinta',
  exito: 'text-exito',
} as const;

/** Chip de estado: icono + texto, el color nunca va solo. */
export default function ChipEstado({
  icono: Icono,
  tono = 'neutro',
  children,
  className,
}: {
  icono?: LucideIcon;
  tono?: keyof typeof TONO;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('chip', TONO[tono], className)}>
      {Icono && <Icono size={16} aria-hidden="true" className="flex-none" />}
      {children}
    </span>
  );
}
