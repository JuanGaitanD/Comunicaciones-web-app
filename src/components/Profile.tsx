import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { X, Check, Moon, Sun, Palette, Shuffle } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface ProfileProps {
  userProfile: UserProfile;
  onClose: () => void;
}

const THEMES: { id: UserProfile['theme']; label: string; color: string }[] = [
  { id: 'default', label: 'Clásico', color: '#94a3b8' },
  { id: 'ocean', label: 'Océano', color: '#99f6e4' },
  { id: 'sunset', label: 'Atardecer', color: '#fed7aa' },
  { id: 'forest', label: 'Bosque', color: '#bbf7d0' },
];

const AVATAR_OPTIONS = {
  skinColor: ['ffdbb4', 'edb98a', 'fd9841', 'ae5d29', 'd08b5b', '614335'],
  top: ['bigHair', 'bob', 'bun', 'curly', 'curvy', 'dreads', 'frida', 'frizzle', 'hat', 'hijab', 'turban', 'winterHat1'],
  clothes: ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'],
  mouth: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  eyes: ['cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky'],
  backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
};

export default function Profile({ userProfile, onClose }: ProfileProps) {
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [avatarConfig, setAvatarConfig] = useState(userProfile.avatarConfig || {
    skinColor: 'ffdbb4',
    top: 'bigHair',
    clothes: 'shirtCrewNeck',
    mouth: 'smile',
    eyes: 'default',
    backgroundColor: 'b6e3f4',
  });
  const [theme, setTheme] = useState(userProfile.theme || 'default');
  const [isDarkMode, setIsDarkMode] = useState(userProfile.isDarkMode || false);
  const [loading, setLoading] = useState(false);

  // Real-time theme application
  React.useEffect(() => {
    const root = document.documentElement;
    root.className = ''; // Reset
    if (theme && theme !== 'default') {
      root.classList.add(`theme-${theme}`);
    }
    if (isDarkMode) {
      root.classList.add('dark');
    }
  }, [theme, isDarkMode]);

  const getAvatarUrl = (config: typeof avatarConfig) => {
    const params = new URLSearchParams({
      skinColor: config.skinColor || 'ffdbb4',
      top: config.top || 'shortHair',
      clothing: config.clothes || 'shirt',
      mouth: config.mouth || 'smile',
      eyes: config.eyes || 'default',
      backgroundColor: config.backgroundColor || 'b6e3f4',
    });
    return `https://api.dicebear.com/7.x/avataaars/svg?${params.toString()}`;
  };

  const handleRandomize = () => {
    const randomConfig = {
      skinColor: AVATAR_OPTIONS.skinColor[Math.floor(Math.random() * AVATAR_OPTIONS.skinColor.length)],
      top: AVATAR_OPTIONS.top[Math.floor(Math.random() * AVATAR_OPTIONS.top.length)],
      clothes: AVATAR_OPTIONS.clothes[Math.floor(Math.random() * AVATAR_OPTIONS.clothes.length)],
      mouth: AVATAR_OPTIONS.mouth[Math.floor(Math.random() * AVATAR_OPTIONS.mouth.length)],
      eyes: AVATAR_OPTIONS.eyes[Math.floor(Math.random() * AVATAR_OPTIONS.eyes.length)],
      backgroundColor: AVATAR_OPTIONS.backgroundColor[Math.floor(Math.random() * AVATAR_OPTIONS.backgroundColor.length)],
    };
    setAvatarConfig(randomConfig);
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const photoURL = getAvatarUrl(avatarConfig);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName,
        photoURL,
        avatarConfig,
        theme,
        isDarkMode
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const updateAvatar = (key: keyof typeof avatarConfig, value: string) => {
    setAvatarConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 relative scrollbar-hide"
      >
        <button onClick={onClose} className="absolute top-6 right-6 btn-icon text-[var(--muted)] hover:bg-[var(--accent)]"><X size={20} /></button>
        
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-[var(--text)] tracking-tight">Personalizar Perfil</h2>
          <p className="text-[var(--muted)]">Ajusta tu identidad digital</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left Column: Avatar Preview & Basic Info (Sticky) */}
          <div className="md:sticky md:top-0 space-y-8 h-fit">
            <div className="flex flex-col items-center space-y-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-[var(--primary)] opacity-20 blur-2xl rounded-full" />
                <img 
                  src={getAvatarUrl(avatarConfig)} 
                  alt="Avatar Preview" 
                  referrerPolicy="no-referrer"
                  className="w-48 h-48 rounded-full border-4 border-[var(--primary)] relative z-10 shadow-2xl"
                />
                <button 
                  onClick={handleRandomize}
                  className="absolute top-0 left-0 z-20 p-3 bg-white dark:bg-gray-800 text-[var(--primary)] rounded-full shadow-lg hover:scale-110 transition-transform border border-[var(--border)]"
                  title="Aleatorio"
                >
                  <Shuffle size={20} />
                </button>
              </div>
              
              <div className="w-full space-y-2">
                <label className="text-xs uppercase tracking-widest font-bold text-[var(--muted)]">Nombre Público</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--muted)]">Preferencias de Sistema</h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    {isDarkMode ? <Moon size={20} className="text-blue-400" /> : <Sun size={20} className="text-yellow-500" />}
                    <span className="font-medium">Modo Oscuro</span>
                  </div>
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors relative",
                      isDarkMode ? "bg-blue-600" : "bg-gray-300"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                      isDarkMode ? "translate-x-6" : "translate-x-0"
                    )}></div>
                  </button>
                </div>

                <div className="p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)] space-y-3">
                  <div className="flex items-center gap-3 text-[var(--muted)]">
                    <Palette size={18} />
                    <span className="text-sm font-bold uppercase tracking-widest">Tema Visual</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {THEMES.map((t) => (
                      <button 
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "h-10 rounded-lg border-2 transition-all flex items-center justify-center",
                          theme === t.id ? "border-[var(--primary)] bg-[var(--accent)]" : "border-transparent bg-[var(--accent)]/50"
                        )}
                        title={t.label}
                      >
                        <div className="w-5 h-5 rounded-full shadow-inner" style={{ backgroundColor: t.color }}></div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Avatar Customization */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--muted)]">Diseño de Avatar</h3>
            
            <div className="space-y-6">
              {/* Skin Color */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Color de Piel</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.skinColor.map(color => (
                    <button 
                      key={color}
                      onClick={() => updateAvatar('skinColor', color)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-all",
                        avatarConfig.skinColor === color ? "border-[var(--primary)] scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: `#${color}` }}
                    />
                  ))}
                </div>
              </div>

              {/* Hair / Top */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Cabello / Estilo</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVATAR_OPTIONS.top.map(top => (
                    <button 
                      key={top}
                      onClick={() => updateAvatar('top', top)}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase rounded-lg border-2 transition-all truncate",
                        avatarConfig.top === top ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]"
                      )}
                    >
                      {top}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clothes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Ropa</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVATAR_OPTIONS.clothes.map(item => (
                    <button 
                      key={item}
                      onClick={() => updateAvatar('clothes', item)}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase rounded-lg border-2 transition-all truncate",
                        avatarConfig.clothes === item ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expression / Mouth */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Boca / Expresión</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVATAR_OPTIONS.mouth.map(item => (
                    <button 
                      key={item}
                      onClick={() => updateAvatar('mouth', item)}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase rounded-lg border-2 transition-all truncate",
                        avatarConfig.mouth === item ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Eyes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Ojos</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVATAR_OPTIONS.eyes.map(item => (
                    <button 
                      key={item}
                      onClick={() => updateAvatar('eyes', item)}
                      className={cn(
                        "px-2 py-2 text-[10px] font-bold uppercase rounded-lg border-2 transition-all truncate",
                        avatarConfig.eyes === item ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]"
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Color */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--muted)]">Fondo</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.backgroundColor.map(color => (
                    <button 
                      key={color}
                      onClick={() => updateAvatar('backgroundColor', color)}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        avatarConfig.backgroundColor === color ? "border-[var(--primary)] scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: `#${color}` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 mt-8 border-t border-[var(--border)] flex justify-end">
          <button 
            onClick={handleSave}
            disabled={loading}
            className="w-full md:w-auto px-12 py-4 bg-[var(--primary)] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20 active:scale-95"
          >
            {loading ? 'Guardando...' : <><Check size={20} /> Guardar Cambios</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
