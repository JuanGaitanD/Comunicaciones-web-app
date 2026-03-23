import React, { Component, ErrorInfo, ReactNode } from 'react';

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

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg)]">
          <div className="card max-w-md w-full p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold text-red-500">¡Ups!</h2>
            <p className="text-[var(--text)]">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary w-full"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
