import { cn } from '../../lib/utils';

/**
 * Medidor de nivel de cinco segmentos (la firma de KallIt). Siempre decorativo: lo acompaña un
 * texto. `nivel` 0–1 enciende 0–5 segmentos; `segmentos` fija un número (piloto quieto).
 */
export default function Medidor({
  nivel,
  segmentos,
  mini,
  carga,
  className,
}: {
  nivel?: number;
  segmentos?: number;
  mini?: boolean;
  carga?: boolean;
  className?: string;
}) {
  const encendidos = segmentos ?? (nivel && nivel > 0 ? Math.min(5, Math.ceil(nivel * 5)) : 0);
  return (
    <span className={cn('medidor', mini && 'medidor-mini', carga && 'medidor-carga', className)} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} data-on={carga ? undefined : i < encendidos} />
      ))}
    </span>
  );
}
