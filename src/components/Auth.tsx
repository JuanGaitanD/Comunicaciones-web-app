import React, { useState } from 'react';
import { supabase } from '../supabase';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) {
      setError(error.message);
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
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--bg)] font-sans">
      {/* Left Pane: Branding & Visuals */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0a0a0a] text-white relative overflow-hidden">
        <div className="relative z-10">
          {/* KallIt brand — panel oscuro */}
          <div className="mb-10">
            <span className="brand-kallit text-5xl">
              <span className="text-white">Kall</span><span className="brand-it text-[var(--primary)]">It</span>
            </span>
            <p className="text-xs uppercase tracking-[0.2em] font-medium opacity-40 mt-2">made by Jada</p>
          </div>
          <h1 className="text-[110px] leading-[0.85] font-bold tracking-tighter mb-8">
            CONECTA<br />TU VOZ
          </h1>
          <p className="max-w-md text-lg opacity-80 leading-relaxed">
            Una plataforma diseñada para la comunicación humana, sin distracciones.
          </p>
        </div>

        <div className="relative z-10 flex gap-12">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase opacity-40">Versión</span>
            <span className="text-sm font-mono">2.0.0-alpha</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase opacity-40">Estado</span>
            <span className="text-sm font-mono text-green-400">En línea</span>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--primary)] opacity-10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-full h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      {/* Right Pane: Auth Forms */}
      <div className="flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md space-y-8"
        >
          {/* KallIt brand — vista móvil */}
          <div className="lg:hidden text-center mb-12">
            <div className="brand-kallit text-5xl mb-2">
              <span className="text-[var(--text)]">Kall</span><span className="brand-it text-[var(--primary)]">It</span>
            </div>
            <p className="text-[var(--muted)]">Conéctate con tu voz</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[var(--text)]">
              {isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
            </h2>
            <p className="text-[var(--muted)]">
              {isLogin ? 'Ingresa tus credenciales para continuar' : 'Únete a la red de comunicación más auténtica'}
            </p>
          </div>

          <div className="flex p-1 bg-[var(--accent)] rounded-xl">
            <button
              onClick={() => setIsLogin(true)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                isLogin ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
              )}
            >
              Entrar
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
                !isLogin ? "bg-[var(--card)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"
              )}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-5">
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold text-[var(--muted)] px-1">Nombre</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all"
                    placeholder="Tu nombre"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider font-semibold text-[var(--muted)] px-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all"
                  placeholder="tu@correo.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider font-semibold text-[var(--muted)] px-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-medium px-1">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[var(--primary)] text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20"
            >
              {loading ? 'Cargando...' : isLogin ? <><LogIn size={20} /> Entrar</> : <><UserPlus size={20} /> Crear cuenta</>}
            </button>
          </form>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[var(--border)]"></span></div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="bg-[var(--bg)] px-4 text-[var(--muted)]">O continúa con</span></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 border border-[var(--border)] rounded-xl flex items-center justify-center gap-3 hover:bg-[var(--accent)] transition-colors font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Acceder con Google
          </button>
        </motion.div>
      </div>
    </div>
  );
}
