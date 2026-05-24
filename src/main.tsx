import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Patch defensivo contra extensiones que mutan el DOM (Google Translate, DeepL,
// etc.). Esas extensiones envuelven nodos de texto en <font> wrappers propios;
// cuando React intenta reconciliar luego con removeChild/insertBefore, el árbol
// real ya no coincide con el virtual y lanza NotFoundError.
//
// El parche detecta la inconsistencia y degrada a no-op + warn en vez de tirar
// toda la app. Es la mitigación estándar (Twitter, Reddit, Pinterest lo usan).
// Issue de referencia: facebook/react#11538.
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn(
        'removeChild bloqueado: el nodo no es hijo de este padre (probablemente Google Translate mutó el DOM).',
        { child, parent: this }
      );
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn(
        'insertBefore bloqueado: el nodo de referencia no es hijo de este padre (probablemente Google Translate mutó el DOM).',
        { newNode, referenceNode, parent: this }
      );
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
