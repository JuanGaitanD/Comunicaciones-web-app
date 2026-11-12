import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import Medidor from './ui/Medidor';

/**
 * Aviso estático de la pantalla de acceso: la demo está en pausa y se activa a pedido.
 * Sin llamadas de red ni comprobación del servidor; el medidor apagado es decorativo
 * («sin señal») y el estado se dice con texto.
 */
export default function AvisoDemo({ className }: { className?: string }) {
  const titulo = useId();
  return (
    <section aria-labelledby={titulo} className={cn('rounded-contenedor bg-superficie p-5', className)}>
      <div className="flex items-center gap-3">
        <Medidor segmentos={0} />
        <h2 id={titulo} className="text-lg font-semibold text-texto">
          Demo en pausa
        </h2>
      </div>
      <p className="mt-3 text-base text-texto">
        KallIt es una demo y su servidor está en pausa: se activa a pedido. Si intentas entrar o registrarte ahora, no
        conectará.
      </p>
      <p className="mt-2 text-sm text-texto-secundario">Para pedir que la activen, usa el perfil del autor en GitHub.</p>
      <a
        href="https://github.com/JuanGaitanD"
        target="_blank"
        rel="noopener noreferrer"
        className="boton-plano -ml-2.5 mt-1 text-accion-tinta"
      >
        Juan Gaitán en GitHub
        <ExternalLink size={16} aria-hidden="true" />
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
    </section>
  );
}
