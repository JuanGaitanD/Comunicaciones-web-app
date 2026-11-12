import { useId, type InputHTMLAttributes, type Ref, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type Comun = {
  /** Etiqueta visible. Donde no la hay, pasa `aria-label`. */
  etiqueta?: string;
  icono?: LucideIcon;
  error?: string;
  /** Fondo `--fondo` en lugar de `--superficie` (campo sobre una superficie). */
  fondo?: boolean;
  claseContenedor?: string;
};

type InputProps = Comun & { multilinea?: false; ref?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>;
type AreaProps = Comun & { multilinea: true; ref?: Ref<HTMLTextAreaElement> } & TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Campo con etiqueta asociada, icono opcional y error en línea. */
export default function Campo(props: InputProps | AreaProps) {
  const { etiqueta, icono: Icono, error, fondo, claseContenedor, multilinea, className, id: idProp, ref, ...resto } = props;
  const auto = useId();
  const id = idProp ?? auto;
  const errorId = error ? `${id}-error` : undefined;
  const comunes = {
    id,
    className: cn('campo', fondo && 'campo-fondo', Icono && 'campo-con-icono', className),
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': errorId,
  };

  return (
    <div className={cn('flex flex-col gap-1.5', claseContenedor)}>
      {etiqueta && (
        <label htmlFor={id} className="text-sm font-medium text-texto-secundario">
          {etiqueta}
        </label>
      )}
      <div className="relative">
        {Icono && (
          <Icono
            size={20}
            className="pointer-events-none absolute left-3 top-[14px] select-none text-texto-secundario"
            aria-hidden="true"
          />
        )}
        {multilinea ? (
          <textarea
            {...comunes}
            {...(resto as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            ref={ref as Ref<HTMLTextAreaElement>}
          />
        ) : (
          <input {...comunes} {...(resto as InputHTMLAttributes<HTMLInputElement>)} ref={ref as Ref<HTMLInputElement>} />
        )}
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm font-medium text-peligro-tinta">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
