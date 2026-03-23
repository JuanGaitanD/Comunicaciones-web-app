import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Mail, Lock, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            displayName: user.displayName || 'Usuario',
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            email: user.email,
            theme: 'default',
            isDarkMode: false
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        try {
          await setDoc(doc(db, 'users', result.user.uid), {
            uid: result.user.uid,
            displayName,
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.uid}`,
            email,
            theme: 'default',
            isDarkMode: false
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${result.user.uid}`);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--bg)] font-sans">
      {/* Left Pane: Branding & Visuals */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0a0a0a] text-white relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-sm uppercase tracking-[0.2em] font-medium opacity-60 mb-8">Comunicaciones made By Jada</h2>
          <h1 className="text-[120px] leading-[0.85] font-bold tracking-tighter mb-8">
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
          <div className="lg:hidden text-center space-y-2 mb-12">
            <h1 className="text-4xl font-bold tracking-tighter text-[var(--text)]">COMUNICACIONES</h1>
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
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
            Acceder con Google
          </button>
        </motion.div>
      </div>
    </div>
  );
}
