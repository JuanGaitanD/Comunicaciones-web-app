import { LogOut } from 'lucide-react';
import Boton from './ui/Boton';
import Medidor from './ui/Medidor';

/** Franja fija mientras dura la demo: dice que es una demo, que los datos son de ejemplo y deja salir. */
export default function FranjaDemo({ onSalir }: { onSalir: () => void }) {
  return (
    <div
      role="region"
      aria-label="Modo demo"
      className="sticky top-0 z-[45] flex h-[var(--franja)] items-center gap-3 border-b border-separador bg-accion-suave px-4 text-sm text-texto sm:px-6"
    >
      <Medidor segmentos={3} mini />
      <p className="min-w-0 truncate">
        <strong className="font-semibold">Demo · datos de ejemplo</strong>
        <span className="max-sm:sr-only"> · Nada de lo que hagas se envía ni se guarda.</span>
      </p>
      <Boton variante="plano" onClick={onSalir} aria-label="Salir de la demo" className="ml-auto flex-none !text-sm">
        <LogOut size={16} aria-hidden="true" />
        <span className="max-sm:hidden">Salir de la demo</span>
        <span className="sm:hidden">Salir</span>
      </Boton>
    </div>
  );
}
