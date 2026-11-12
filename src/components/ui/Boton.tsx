import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'peligro' | 'terciario' | 'plano';
  tamano?: 'md' | 'lg' | 'cuadrado' | 'tecla';
  /** Solo para variante plano: tinta de acción o de peligro. */
  tono?: 'accion' | 'peligro';
  cargando?: boolean;
  icono?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTE: Record<NonNullable<BotonProps['variante']>, string> = {
  primario: 'boton',
  secundario: 'boton boton-secundario',
  peligro: 'boton boton-peligro',
  terciario: 'boton boton-terciario',
  plano: 'boton-plano',
};

const TAMANO: Record<NonNullable<BotonProps['tamano']>, string> = {
  md: '',
  lg: 'boton-lg',
  cuadrado: 'boton-cuadrado',
  tecla: 'boton-tecla',
};

/** Botón con cuerpo (cara + canto que se hunde al pulsar); `plano` es la salida de filas densas. */
export default function Boton({
  variante = 'primario',
  tamano = 'md',
  tono,
  cargando = false,
  icono,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...resto
}: BotonProps) {
  const plano = variante === 'plano';
  return (
    <button
      ref={ref}
      type={type}
      data-tono={plano ? tono : undefined}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(VARIANTE[variante], !plano && TAMANO[tamano], className)}
      {...resto}
    >
      {cargando ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : icono}
      {children}
    </button>
  );
}
