import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { motion } from 'motion/react';
import { X, Check, Moon, Sun, Shuffle, CloudOff } from 'lucide-react';
import { UserProfile } from '../types';
import { useDialogo } from '../hooks/useDialogo';
import { demoActiva } from '../demo/modo';
import { esErrorDeRed, mensajeDeError } from '../lib/errores';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import GrupoOpciones from './ui/GrupoOpciones';
import Interruptor from './ui/Interruptor';
import MensajeError from './ui/MensajeError';
import Selector from './ui/Selector';

interface ProfileProps {
  userProfile: UserProfile;
  onClose: () => void;
  onProfileUpdated?: () => void | Promise<void>;
}

// Muestra = cara de acción de cada tema (los identificadores guardados no cambian)
const THEMES: { id: UserProfile['theme']; label: string; color: string }[] = [
  { id: 'default', label: 'Clásico', color: '#fea754' },
  { id: 'ocean', label: 'Océano', color: '#56d2df' },
  { id: 'sunset', label: 'Atardecer', color: '#fd9ac6' },
  { id: 'forest', label: 'Bosque', color: '#7cd591' },
];

const AVATAR_OPTIONS = {
  skinColor: ['ffdbb4', 'edb98a', 'fd9841', 'ae5d29', 'd08b5b', '614335'],
  top: ['bigHair', 'bob', 'bun', 'curly', 'curvy', 'dreads', 'frida', 'frizzle', 'hat', 'hijab', 'turban', 'winterHat1'],
  clothes: ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'],
  mouth: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  eyes: ['cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky'],
  backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
};

// Etiquetas en español solo para mostrar; el valor guardado es el identificador de DiceBear de siempre
const ETIQUETAS = {
  top: { bigHair: 'Melena', bob: 'Bob', bun: 'Moño', curly: 'Rizado', curvy: 'Ondulado', dreads: 'Rastas', frida: 'Frida', frizzle: 'Crespo', hat: 'Sombrero', hijab: 'Hiyab', turban: 'Turbante', winterHat1: 'Gorro de invierno' },
  clothes: { blazerAndShirt: 'Blazer y camisa', blazerAndSweater: 'Blazer y suéter', collarAndSweater: 'Cuello y suéter', graphicShirt: 'Camiseta estampada', hoodie: 'Sudadera', overall: 'Overol', shirtCrewNeck: 'Camiseta cuello redondo', shirtScoopNeck: 'Camiseta cuello amplio', shirtVNeck: 'Camiseta cuello en V' },
  mouth: { concerned: 'Preocupada', default: 'Neutra', disbelief: 'Incrédula', eating: 'Comiendo', grimace: 'Mueca', sad: 'Triste', screamOpen: 'Gritando', serious: 'Seria', smile: 'Sonrisa', tongue: 'Lengua afuera', twinkle: 'Pícara', vomit: 'Asqueada' },
  eyes: { cry: 'Llorando', default: 'Normales', eyeRoll: 'En blanco', happy: 'Felices', hearts: 'Corazones', side: 'De reojo', squint: 'Entrecerrados', surprised: 'Sorprendidos', wink: 'Guiño', winkWacky: 'Guiño loco' },
} as const;

const opcionesDe = (clave: keyof typeof ETIQUETAS) =>
  AVATAR_OPTIONS[clave].map((valor) => ({
    valor,
    etiqueta: (ETIQUETAS[clave] as Record<string, string>)[valor] ?? valor,
  }));

const DEFAULT_AVATAR_CONFIG = {
  skinColor: 'ffdbb4',
  top: 'bigHair',
  clothes: 'shirtCrewNeck',
  mouth: 'smile',
  eyes: 'default',
  backgroundColor: 'b6e3f4',
};

export default function Profile({ userProfile, onClose, onProfileUpdated }: ProfileProps) {
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [avatarConfig, setAvatarConfig] = useState(() => {
    const cfg = userProfile.avatarConfig;
    // Si DB trae null o {} (default jsonb), arrancamos con el preset completo.
    // Si trae algo parcial, mergeamos para tener todos los campos válidos.
    if (!cfg || Object.keys(cfg).length === 0) return DEFAULT_AVATAR_CONFIG;
    return { ...DEFAULT_AVATAR_CONFIG, ...cfg };
  });
  const [theme, setTheme] = useState(userProfile.theme || 'default');
  const [isDarkMode, setIsDarkMode] = useState(userProfile.isDarkMode || false);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<{ texto: string; red: boolean } | null>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // Diálogo modal: foco al nombre, Tab contenido, Escape cierra y el foco vuelve a «Ajustes»
  useDialogo({ ref: dialogoRef, abierto: true, onCerrar: onClose, focoInicial: nombreRef });

  useEffect(() => {
    const root = document.documentElement;
    root.className = '';
    if (theme && theme !== 'default') {
      root.classList.add(`theme-${theme}`);
    }
    if (isDarkMode) {
      root.classList.add('dark');
    }
  }, [theme, isDarkMode]);

  const getAvatarUrl = (config: typeof avatarConfig) => {
    // Demo: el avatar se dibuja en local; no se pide nada a DiceBear
    const demo = demoActiva();
    if (demo) return demo.avatarDesdeConfig(config);
    const params = new URLSearchParams({
      skinColor: config.skinColor || DEFAULT_AVATAR_CONFIG.skinColor,
      top: config.top || DEFAULT_AVATAR_CONFIG.top,
      clothing: config.clothes || DEFAULT_AVATAR_CONFIG.clothes,
      mouth: config.mouth || DEFAULT_AVATAR_CONFIG.mouth,
      eyes: config.eyes || DEFAULT_AVATAR_CONFIG.eyes,
      backgroundColor: config.backgroundColor || DEFAULT_AVATAR_CONFIG.backgroundColor,
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
    setLoading(true);
    setSaveError(null);
    const photoURL = getAvatarUrl(avatarConfig);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        photo_url: photoURL,
        avatar_config: avatarConfig,
        theme,
        is_dark_mode: isDarkMode,
      })
      .eq('id', userProfile.uid);

    setLoading(false);

    if (error) {
      console.error('Error guardando perfil:', error);
      setSaveError({ texto: mensajeDeError(error), red: esErrorDeRed(error) });
      return;
    }
    await onProfileUpdated?.();
    onClose();
  };

  const updateAvatar = (key: keyof typeof avatarConfig, value: string) => {
    setAvatarConfig(prev => ({ ...prev, [key]: value }));
  };

  const selector = (clave: keyof typeof ETIQUETAS, etiqueta: string) => (
    <Selector
      etiqueta={etiqueta}
      valor={avatarConfig[clave]}
      opciones={opcionesDe(clave)}
      onCambio={(v) => updateAvatar(clave, v)}
    />
  );

  return (
    <div className="velo fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-4">
      <motion.div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ajustes"
        aria-describedby="descripcion-ajustes"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative flex h-dvh w-full flex-col bg-superficie md:h-auto md:max-h-[92vh] md:max-w-4xl md:rounded-contenedor"
      >
        <Boton variante="plano" onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-3 z-10">
          <X size={20} aria-hidden="true" />
        </Boton>

        <div className="px-6 pb-2 pt-6 pr-16">
          <h2 id="titulo-ajustes" className="text-2xl font-bold">Personalizar Perfil</h2>
          <p id="descripcion-ajustes" className="text-texto-secundario">Ajusta tu identidad digital</p>
          {demoActiva() && (
            <p className="mt-1 text-sm font-medium text-accion-tinta">
              Demo: lo que cambies aquí solo dura esta visita y no se guarda en ningún servidor.
            </p>
          )}
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
            {/* Columna izquierda: vista previa, nombre y preferencias */}
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-5">
                <div className="relative">
                  <img
                    src={getAvatarUrl(avatarConfig)}
                    alt="Avatar Preview"
                    referrerPolicy="no-referrer"
                    className="h-40 w-40 rounded-full border-2 border-separador"
                  />
                  <Boton
                    variante="secundario"
                    onClick={handleRandomize}
                    title="Aleatorio"
                    aria-label="Avatar aleatorio"
                    className="absolute left-0 top-0 !min-h-11 w-11 !rounded-full !px-0"
                  >
                    <Shuffle size={20} aria-hidden="true" />
                  </Boton>
                </div>
                <Campo
                  etiqueta="Nombre Público"
                  type="text"
                  ref={nombreRef}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  claseContenedor="w-full"
                  fondo
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold">Preferencias de Sistema</h3>
                <Interruptor
                  etiqueta="Modo Oscuro"
                  activo={isDarkMode}
                  onCambio={setIsDarkMode}
                  iconoActivo={<Moon size={14} aria-hidden="true" />}
                  iconoInactivo={<Sun size={14} aria-hidden="true" />}
                />
                <GrupoOpciones
                  leyenda="Tema Visual"
                  nombre="tema-visual"
                  valor={theme}
                  onCambio={(v) => setTheme(v as UserProfile['theme'])}
                  columnas={2}
                  opciones={THEMES.map((t) => ({
                    valor: t.id,
                    etiqueta: t.label,
                    icono: (
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 flex-none rounded-full border border-borde-campo"
                        style={{ backgroundColor: t.color }}
                      />
                    ),
                  }))}
                />
              </div>
            </div>

            {/* Columna derecha: diseño del avatar */}
            <div className="space-y-5">
              <h3 className="text-base font-semibold">Diseño de Avatar</h3>

              <GrupoOpciones
                leyenda="Color de Piel"
                nombre="color-piel"
                variante="muestra"
                valor={avatarConfig.skinColor}
                onCambio={(v) => updateAvatar('skinColor', v)}
                opciones={AVATAR_OPTIONS.skinColor.map((color, i) => ({
                  valor: color,
                  etiqueta: `Tono ${i + 1} de ${AVATAR_OPTIONS.skinColor.length}`,
                  nombreAccesible: `Tono ${i + 1} de ${AVATAR_OPTIONS.skinColor.length}`,
                  color: `#${color}`,
                }))}
              />

              {selector('top', 'Cabello / Estilo')}
              {selector('clothes', 'Ropa')}
              {selector('mouth', 'Boca / Expresión')}
              {selector('eyes', 'Ojos')}

              <GrupoOpciones
                leyenda="Fondo"
                nombre="color-fondo"
                variante="muestra"
                valor={avatarConfig.backgroundColor}
                onCambio={(v) => updateAvatar('backgroundColor', v)}
                opciones={AVATAR_OPTIONS.backgroundColor.map((color, i) => ({
                  valor: color,
                  etiqueta: `Fondo ${i + 1} de ${AVATAR_OPTIONS.backgroundColor.length}`,
                  nombreAccesible: `Fondo ${i + 1} de ${AVATAR_OPTIONS.backgroundColor.length}`,
                  color: `#${color}`,
                }))}
              />
            </div>
          </div>
        </div>

        {/* Pie fijo: siempre a la vista */}
        <div className="space-y-3 border-t border-separador px-6 py-4">
          {saveError && <MensajeError icono={saveError.red ? CloudOff : undefined}>{saveError.texto}</MensajeError>}
          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Boton variante="terciario" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton
              onClick={handleSave}
              cargando={loading}
              tamano="lg"
              icono={loading ? undefined : <Check size={20} aria-hidden="true" />}
              className="sm:min-w-52"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </Boton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
