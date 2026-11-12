import { useEffect, useRef, type RefObject } from 'react';

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Opciones {
  /** Contenedor del diálogo. */
  ref: RefObject<HTMLElement | null>;
  abierto: boolean;
  onCerrar: () => void;
  /** Modal: contiene el foco con Tab y deja inertes los elementos que lo rodean. Por defecto sí. */
  modal?: boolean;
  /** Elemento que recibe el foco al abrir (por defecto, el primero enfocable). */
  focoInicial?: RefObject<HTMLElement | null>;
}

function visibles(raiz: HTMLElement) {
  return Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Patrón de diálogo sin librería: foco inicial, contención de Tab (si es modal),
 * Escape que cierra y retorno del foco al activador.
 */
export function useDialogo({ ref, abierto, onCerrar, modal = true, focoInicial }: Opciones) {
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const raiz = ref.current;
    if (!abierto || !raiz) return;
    const activador = document.activeElement as HTMLElement | null;

    // Deja inerte lo que rodea al diálogo (hermanos de cada ancestro hasta #root)
    const inertes: HTMLElement[] = [];
    if (modal) {
      let nodo: HTMLElement | null = raiz;
      while (nodo && nodo.id !== 'root' && nodo.parentElement) {
        for (const hermano of Array.from(nodo.parentElement.children)) {
          if (hermano !== nodo && hermano instanceof HTMLElement && !hermano.inert && hermano.tagName !== 'SCRIPT' && !hermano.hasAttribute('data-no-inert')) {
            hermano.inert = true;
            inertes.push(hermano);
          }
        }
        nodo = nodo.parentElement;
      }
    }

    const alMontar = window.setTimeout(() => {
      const destino = focoInicial?.current ?? visibles(raiz)[0] ?? raiz;
      destino.focus({ preventScroll: true });
    }, 0);

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (modal && e.key === 'Tab') {
        const lista = visibles(raiz);
        if (lista.length === 0) {
          e.preventDefault();
          return;
        }
        const primero = lista[0];
        const ultimo = lista[lista.length - 1];
        const enRaiz = raiz.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === primero || !enRaiz)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && (document.activeElement === ultimo || !enRaiz)) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', alPulsar);

    return () => {
      window.clearTimeout(alMontar);
      document.removeEventListener('keydown', alPulsar);
      inertes.forEach((el) => {
        el.inert = false;
      });
      if (activador && document.contains(activador)) activador.focus({ preventScroll: true });
    };
  }, [abierto, modal, ref, focoInicial]);
}
