import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import Boton from './ui/Boton';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      let errorMessage = 'Algo salió mal. Por favor, intenta de nuevo.';
      
      try {
        // Check if it's our JSON error from handleFirestoreError
        const parsedError = JSON.parse(error?.message || '');
        if (parsedError.error && parsedError.operationType) {
          errorMessage = `Error de base de datos (${parsedError.operationType}): ${parsedError.error}`;
          if (parsedError.error.includes('Missing or insufficient permissions')) {
            errorMessage = 'No tienes permisos suficientes para realizar esta acción. Por favor, contacta al administrador.';
          }
        }
      } catch (e) {
        // Not a JSON error, use default or the error message if it's simple
        if (error?.message && !error.message.startsWith('{')) {
          errorMessage = error.message;
        }
      }

      // translate="no" en el contenedor: el ErrorBoundary es justo el lugar
      // donde queremos que NADA sea reescrito por Google Translate, porque a
      // veces el crash original fue causado precisamente por la traducción.
      // El botón debe quedar siempre legible y clickable.
      return (
        <div
          translate="no"
          className="notranslate min-h-screen flex items-center justify-center p-4 bg-fondo"
        >
          <div className="card max-w-md w-full p-8 text-center space-y-6">
            <div className="brand-kallit text-marca">
              <span>Kall</span>
              <span className="brand-it">It</span>
            </div>
            <div className="space-y-3">
              <h2 className="flex items-center justify-center gap-2 text-2xl font-bold text-texto">
                <AlertCircle size={28} className="text-peligro-tinta" aria-hidden="true" /> ¡Ups!
              </h2>
              <p role="alert" className="text-texto-secundario">{errorMessage}</p>
            </div>
            <Boton tamano="lg" onClick={() => window.location.reload()} className="w-full">
              Recargar página
            </Boton>
          </div>
        </div>
      );
    }

    return children;
  }
}
