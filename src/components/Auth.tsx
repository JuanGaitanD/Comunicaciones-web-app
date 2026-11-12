import React, { useState } from 'react';
import { supabase } from '../supabase';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon, CloudOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { esErrorDeRed, mensajeDeError } from '../lib/errores';
import AvisoDemo from './AvisoDemo';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import Medidor from './ui/Medidor';
import MensajeError from './ui/MensajeError';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [errorDeRed, setErrorDeRed] = useState(false);
  const [loading, setLoading] = useState(false);

  const fallo = (err: unknown) => {
    setError(mensajeDeError(err));
    setErrorDeRed(esErrorDeRed(err));
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) {
      fallo(error);
      setLoading(false);
    }
    // En éxito: el navegador redirige al consent de Google.
    // Al volver, onAuthStateChange en App.tsx detecta la sesión.
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: displayName } },
        });
        if (error) throw error;
        // El trigger handle_new_user crea la fila en profiles automáticamente,
        // incluyendo un avatar DiceBear por defecto si no hay metadata OAuth.
      }
    } catch (err: any) {
      fallo(err);
    } finally {
      setLoading(false);
    }
  };

  // Pestañas Entrar / Registrarse: flechas para pasar de una a otra
  const alPulsarPestana = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nuevo = e.key === 'ArrowLeft';
      setIsLogin(nuevo);
      document.getElementById(nuevo ? 'pestana-entrar' : 'pestana-registro')?.focus();
    }
  };

  const pestana = (activa: boolean) =>
    cn(
      'min-h-11 flex-1 rounded-control px-4 text-base transition-colors',
      activa ? 'bg-superficie font-semibold text-texto' : 'font-medium text-texto-secundario hover:text-texto'
    );

  return (
    <div className="min-h-screen grid grid-cols-1 bg-fondo font-sans lg:grid-cols-2">
      {/* Panel izquierdo: la «cara del equipo», siempre en grafito oscuro */}
      <div className="dark hidden flex-col justify-between bg-fondo-alterno p-12 text-texto lg:flex">
        <div>
          <div className="mb-12 flex items-center gap-4">
            <span className="brand-kallit text-marca">
              <span>Kall</span>
              <span className="brand-it">It</span>
            </span>
            <Medidor segmentos={3} />
            <p className="text-sm text-texto-secundario">made by Jada</p>
          </div>
          <h1 className="mb-8 text-[4.5rem] font-bold leading-none tracking-tight xl:text-titular">
            CONECTA
            <br />
            TU VOZ
          </h1>
          <p className="max-w-md text-lg text-texto-secundario">
            Una plataforma diseñada para la comunicación humana, sin distracciones.
          </p>
        </div>

        <AvisoDemo className="max-w-md" />

        <div className="flex flex-col gap-1">
          <span className="text-sm text-texto-secundario">Versión</span>
          <span className="text-base tabular-nums">2.0.0-alpha</span>
        </div>
      </div>

      {/* Panel derecho: formulario */}
      <div className="flex items-center justify-center p-6 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Marca en móvil */}
          <div className="text-center lg:hidden">
            <h1 className="brand-kallit text-marca-movil">
              <span>Kall</span>
              <span className="brand-it">It</span>
            </h1>
            <div className="mt-3 flex justify-center">
              <Medidor segmentos={3} />
            </div>
            <p className="mt-3 text-texto-secundario">Conéctate con tu voz</p>
          </div>

          <AvisoDemo className="lg:hidden" />

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
            <p className="text-texto-secundario">
              {isLogin ? 'Ingresa tus credenciales para continuar' : 'Únete a la red de comunicación más auténtica'}
            </p>
          </div>

          <div role="tablist" aria-label="Acceso" className="flex gap-1 rounded-contenedor bg-fondo-alterno p-1" onKeyDown={alPulsarPestana}>
            <button
              id="pestana-entrar"
              type="button"
              role="tab"
              aria-selected={isLogin}
              aria-controls="panel-acceso"
              tabIndex={isLogin ? 0 : -1}
              onClick={() => setIsLogin(true)}
              className={pestana(isLogin)}
            >
              Entrar
            </button>
            <button
              id="pestana-registro"
              type="button"
              role="tab"
              aria-selected={!isLogin}
              aria-controls="panel-acceso"
              tabIndex={!isLogin ? 0 : -1}
              onClick={() => setIsLogin(false)}
              className={pestana(!isLogin)}
            >
              Registrarse
            </button>
          </div>

          <div id="panel-acceso" role="tabpanel" aria-labelledby={isLogin ? 'pestana-entrar' : 'pestana-registro'}>
            <form onSubmit={handleEmailAuth} className="space-y-5">
              {!isLogin && (
                <Campo
                  etiqueta="Nombre"
                  icono={UserIcon}
                  type="text"
                  required
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                />
              )}
              <Campo
                etiqueta="Correo Electrónico"
                icono={Mail}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
              <Campo
                etiqueta="Contraseña"
                icono={Lock}
                type="password"
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {error && <MensajeError icono={errorDeRed ? CloudOff : undefined}>{error}</MensajeError>}

              <Boton type="submit" tamano="lg" cargando={loading} className="w-full">
                {loading ? (
                  'Cargando...'
                ) : isLogin ? (
                  <>
                    <LogIn size={20} aria-hidden="true" /> Entrar
                  </>
                ) : (
                  <>
                    <UserPlus size={20} aria-hidden="true" /> Crear cuenta
                  </>
                )}
              </Boton>
            </form>
          </div>

          <div className="flex items-center gap-4 text-sm text-texto-secundario">
            <span className="h-px flex-1 bg-separador" aria-hidden="true" />
            O continúa con
            <span className="h-px flex-1 bg-separador" aria-hidden="true" />
          </div>

          <Boton variante="secundario" tamano="lg" onClick={handleGoogleLogin} disabled={loading} className="w-full gap-3">
            <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Acceder con Google
          </Boton>
        </motion.div>
      </div>
    </div>
  );
}
