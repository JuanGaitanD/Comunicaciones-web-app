import { useId, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { entrarEnDemo } from '../demo/modo';
import Boton from './ui/Boton';
import Medidor from './ui/Medidor';
import MensajeError from './ui/MensajeError';

export const ENLACE_CONTACTO = 'https://juandgaitan.com/es/#contacto';

/**
 * Aviso de la pantalla de acceso: esto es una demo. Se puede recorrer con datos de ejemplo («Probar la
 * demo», sin cuenta y sin red: el código de la demo se descarga solo al pulsar) y, para usarla de verdad,
 * hay que pedir una muestra o prueba. El aviso no hace ninguna petición por sí mismo.
 */
export default function AvisoDemo({ className }: { className?: string }) {
  const titulo = useId();
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const probar = async () => {
    setCargando(true);
    setFallo(false);
    try {
      await entrarEnDemo();
    } catch (err) {
      console.error('No se pudo cargar la demo:', err);
      setFallo(true);
      setCargando(false);
    }
  };

  return (
    <section aria-labelledby={titulo} className={cn('card space-y-3 p-5', className)}>
      <div className="flex items-center gap-3">
        <Medidor segmentos={3} />
        <h2 id={titulo} className="text-lg font-semibold text-texto">
          Esto es una demo
        </h2>
      </div>
      <p className="text-base text-texto">
        Puedes probar KallIt ahora con datos de ejemplo: nada se envía ni se guarda en ningún servidor.
      </p>
      <Boton onClick={probar} cargando={cargando} icono={<Play size={20} aria-hidden="true" />} className="w-full sm:w-auto">
        Probar la demo
      </Boton>
      {fallo && <MensajeError>No se pudo cargar la demo. Revisa tu conexión e inténtalo de nuevo.</MensajeError>}
      <p className="text-sm text-texto-secundario">
        Entrar con una cuenta real todavía no es posible: el servidor está en pausa. Para usarla de verdad, pide una muestra o una
        prueba.
      </p>
      <a
        href={ENLACE_CONTACTO}
        target="_blank"
        rel="noopener noreferrer"
        className="boton-plano -ml-2.5 text-accion-tinta"
      >
        Pedir una muestra o prueba
        <ExternalLink size={16} aria-hidden="true" />
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
    </section>
  );
}
