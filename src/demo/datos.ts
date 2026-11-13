/**
 * Datos de ejemplo de la demo. Todo es inventado: nombres, salas y mensajes. Ninguna persona real.
 * Los avatares se dibujan aquí mismo como SVG en línea (data:), sin pedir nada a la red.
 */

export interface ConfigAvatar {
  skinColor?: string;
  top?: string;
  clothes?: string;
  mouth?: string;
  eyes?: string;
  backgroundColor?: string;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const PELO = ['#2c1b18', '#4a312c', '#a55728', '#724133', '#b58143', '#c93305', '#d6d1d1'];
const ROPA = ['#3c4f5c', '#2f7fb5', '#c9484d', '#25557c', '#7a7f83', '#c23a74', '#3f7dc4', '#262e33', '#c9c9c9'];

/** Avatar dibujado en local (cabeza, pelo, ojos, boca y ropa según la configuración de Ajustes). */
export function avatarLocal(c: ConfigAvatar): string {
  const fondo = `#${c.backgroundColor || 'b6e3f4'}`;
  const piel = `#${c.skinColor || 'ffdbb4'}`;
  const pelo = PELO[hash(c.top || 'bigHair') % PELO.length];
  const ropa = ROPA[hash(c.clothes || 'shirtCrewNeck') % ROPA.length];
  const top = c.top || 'bigHair';
  const ojos = c.eyes || 'default';
  const boca = c.mouth || 'smile';

  const peloDetras =
    /bigHair|curly|curvy|dreads|frizzle|frida|hijab|turban/.test(top)
      ? `<ellipse cx="50" cy="44" rx="27" ry="29" fill="${pelo}"/>`
      : '';
  const peloDelante = /bob/.test(top)
    ? `<path d="M30 42 Q50 14 70 42 L70 56 L64 56 L64 38 Q50 28 36 38 L36 56 L30 56Z" fill="${pelo}"/>`
    : /hat|winterHat1/.test(top)
      ? `<path d="M29 40 Q50 8 71 40Z" fill="${pelo}"/><rect x="27" y="38" width="46" height="6" rx="3" fill="${pelo}"/>`
      : /bun/.test(top)
        ? `<circle cx="50" cy="20" r="9" fill="${pelo}"/><path d="M31 42 Q50 16 69 42Z" fill="${pelo}"/>`
        : `<path d="M31 44 Q50 14 69 44 Q50 34 31 44Z" fill="${pelo}"/>`;

  const ojosSvg =
    ojos === 'happy' || ojos === 'squint'
      ? `<path d="M38 46 Q42 42 46 46M54 46 Q58 42 62 46" stroke="#262e33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : ojos === 'wink' || ojos === 'winkWacky'
        ? `<circle cx="42" cy="46" r="2.8" fill="#262e33"/><path d="M54 46 Q58 42 62 46" stroke="#262e33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        : ojos === 'surprised'
          ? `<circle cx="42" cy="46" r="4" fill="#fff" stroke="#262e33" stroke-width="1.6"/><circle cx="58" cy="46" r="4" fill="#fff" stroke="#262e33" stroke-width="1.6"/><circle cx="42" cy="46" r="1.8" fill="#262e33"/><circle cx="58" cy="46" r="1.8" fill="#262e33"/>`
          : ojos === 'hearts'
            ? `<path d="M42 49 L38.5 45.5 A2.3 2.3 0 0 1 42 42.5 A2.3 2.3 0 0 1 45.5 45.5Z M58 49 L54.5 45.5 A2.3 2.3 0 0 1 58 42.5 A2.3 2.3 0 0 1 61.5 45.5Z" fill="#c9484d"/>`
            : `<circle cx="42" cy="46" r="2.8" fill="#262e33"/><circle cx="58" cy="46" r="2.8" fill="#262e33"/>${ojos === 'cry' ? '<path d="M42 50 q-2 4 0 6 q2-2 0-6" fill="#5aa9e6"/>' : ''}`;

  const bocaSvg =
    boca === 'sad' || boca === 'concerned' || boca === 'grimace'
      ? `<path d="M43 61 Q50 55 57 61" stroke="#262e33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : boca === 'serious' || boca === 'default' || boca === 'disbelief'
        ? `<path d="M44 59 H56" stroke="#262e33" stroke-width="2.4" stroke-linecap="round"/>`
        : boca === 'screamOpen' || boca === 'eating' || boca === 'vomit'
          ? `<ellipse cx="50" cy="59" rx="5" ry="4.5" fill="#7a2d2d"/>`
          : boca === 'tongue'
            ? `<path d="M43 56 Q50 64 57 56" stroke="#262e33" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M47 60 v5 a3 3 0 0 0 6 0 v-5Z" fill="#e0707f"/>`
            : `<path d="M43 56 Q50 64 57 56" stroke="#262e33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
    `<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>` +
    `<circle cx="50" cy="50" r="50" fill="${fondo}"/><g clip-path="url(#c)">${peloDetras}` +
    `<path d="M12 100 Q14 76 50 74 Q86 76 88 100Z" fill="${ropa}"/>` +
    `<rect x="43" y="62" width="14" height="16" rx="5" fill="${piel}"/>` +
    `<ellipse cx="50" cy="48" rx="20" ry="23" fill="${piel}"/>${peloDelante}${ojosSvg}${bocaSvg}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const CONFIG_INICIAL: Required<ConfigAvatar> = {
  skinColor: 'ffdbb4',
  top: 'bigHair',
  clothes: 'shirtCrewNeck',
  mouth: 'smile',
  eyes: 'default',
  backgroundColor: 'b6e3f4',
};

interface Persona {
  id: string;
  nombre: string;
  avatar: ConfigAvatar;
}

export const YO = 'demo-u00-tu';

export const PERSONAS: Record<string, Persona> = {
  valentina: { id: 'demo-u01-valentina', nombre: 'Valentina Ríos', avatar: { skinColor: 'edb98a', top: 'bob', clothes: 'hoodie', mouth: 'smile', eyes: 'happy', backgroundColor: 'ffd5dc' } },
  mateo: { id: 'demo-u02-mateo', nombre: 'Mateo Cárdenas', avatar: { skinColor: 'd08b5b', top: 'curly', clothes: 'graphicShirt', mouth: 'twinkle', eyes: 'wink', backgroundColor: 'c0aede' } },
  camila: { id: 'demo-u03-camila', nombre: 'Camila Ortega', avatar: { skinColor: 'ae5d29', top: 'bun', clothes: 'blazerAndShirt', mouth: 'default', eyes: 'default', backgroundColor: 'ffdfbf' } },
  santiago: { id: 'demo-u04-santiago', nombre: 'Santiago Mejía', avatar: { skinColor: 'ffdbb4', top: 'hat', clothes: 'shirtVNeck', mouth: 'serious', eyes: 'side', backgroundColor: 'b6e3f4' } },
  daniela: { id: 'demo-u05-daniela', nombre: 'Daniela Fuentes', avatar: { skinColor: 'edb98a', top: 'curvy', clothes: 'overall', mouth: 'smile', eyes: 'surprised', backgroundColor: 'd1d4f9' } },
  julian: { id: 'demo-u06-julian', nombre: 'Julián Pardo', avatar: { skinColor: '614335', top: 'dreads', clothes: 'shirtCrewNeck', mouth: 'smile', eyes: 'default', backgroundColor: 'ffdfbf' } },
  bruno: { id: 'demo-u07-bruno', nombre: 'Bruno Salas', avatar: { skinColor: 'fd9841', top: 'frizzle', clothes: 'collarAndSweater', mouth: 'grimace', eyes: 'squint', backgroundColor: 'd1d4f9' } },
  lucia: { id: 'demo-u08-lucia', nombre: 'Lucía Navarro', avatar: { skinColor: 'ffdbb4', top: 'frida', clothes: 'shirtScoopNeck', mouth: 'tongue', eyes: 'happy', backgroundColor: 'ffd5dc' } },
  andres: { id: 'demo-u09-andres', nombre: 'Andrés Lozano', avatar: { skinColor: 'd08b5b', top: 'winterHat1', clothes: 'blazerAndSweater', mouth: 'smile', eyes: 'default', backgroundColor: 'b6e3f4' } },
  isabela: { id: 'demo-u10-isabela', nombre: 'Isabela Peña', avatar: { skinColor: 'edb98a', top: 'hijab', clothes: 'hoodie', mouth: 'smile', eyes: 'hearts', backgroundColor: 'c0aede' } },
  tomas: { id: 'demo-u11-tomas', nombre: 'Tomás Herrera', avatar: { skinColor: 'ae5d29', top: 'turban', clothes: 'graphicShirt', mouth: 'default', eyes: 'cry', backgroundColor: 'ffdfbf' } },
};

export const perfilDe = (clave: string) => {
  const p = PERSONAS[clave];
  return { id: p.id, display_name: p.nombre, photo_url: avatarLocal(p.avatar), email: '', theme: 'default', is_dark_mode: false, avatar_config: p.avatar };
};

const min = 60_000;
const hora = 60 * min;
const dia = 24 * hora;
const iso = (t: number) => new Date(t).toISOString();

export interface Semilla {
  profiles: any[];
  friendships: any[];
  calls: any[];
  call_messages: any[];
  dm_threads: any[];
  dm_messages: any[];
  /** Quién está en cada sala al entrar (clave de PERSONAS) y cómo llega. */
  salas: Record<string, { quien: { clave: string; mood: string; silenciado: boolean }[] }>;
  respuestasDM: Record<string, string[]>;
  respuestasSala: string[];
  entranteDM: { de: string; texto: string; tras: number };
}

const par = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export function crearSemilla(ahora = Date.now()): Semilla {
  const P = (k: string) => PERSONAS[k].id;
  const amistad = (otro: string, estado: string, pidio: string, hace: number) => {
    const [a, b] = par(YO, P(otro));
    return { user_a_id: a, user_b_id: b, status: estado, requested_by: pidio, created_at: iso(ahora - hace), updated_at: iso(ahora - hace) };
  };
  const hilo = (otro: string, n: number) => {
    const [a, b] = par(YO, P(otro));
    return { id: `demo-dm-${n}`, user_a_id: a, user_b_id: b, created_at: iso(ahora - 5 * dia), last_message_at: iso(ahora - 40 * min) };
  };
  const dm = (n: number, i: number, de: string, body: string, hace: number) => ({ id: `demo-dmm-${n}-${i}`, thread_id: `demo-dm-${n}`, sender_id: de, body, created_at: iso(ahora - hace) });
  const sala = (id: string, name: string, creador: string, vis: 'public' | 'private', codigo: string | null, creada: number) => ({
    id, name, creator_id: creador, status: 'active', visibility: vis, invite_code: codigo, created_at: iso(ahora - creada), last_active_at: iso(ahora), ended_at: null,
  });
  const terminada = (id: string, name: string, creador: string, hace: number) => ({
    id, name, creator_id: creador, status: 'ended', visibility: 'public', invite_code: null, created_at: iso(ahora - hace), last_active_at: iso(ahora - hace), ended_at: iso(ahora - hace + hora),
  });
  const msg = (sala: string, i: number, de: string, body: string, hace: number) => ({ id: `demo-cm-${sala}-${i}`, call_id: sala, sender_id: de, body, created_at: iso(ahora - hace) });

  return {
    profiles: [
      { id: YO, display_name: 'Invitado', photo_url: avatarLocal(CONFIG_INICIAL), email: 'demo@ejemplo.invalid', theme: 'default', is_dark_mode: false, avatar_config: CONFIG_INICIAL },
      ...Object.keys(PERSONAS).map(perfilDe),
    ],
    friendships: [
      amistad('valentina', 'accepted', YO, 20 * dia),
      amistad('mateo', 'accepted', P('mateo'), 14 * dia),
      amistad('camila', 'accepted', YO, 9 * dia),
      amistad('santiago', 'accepted', P('santiago'), 3 * dia),
      amistad('daniela', 'pending', P('daniela'), 2 * hora),
      amistad('julian', 'pending', YO, dia),
      amistad('bruno', 'blocked', YO, 30 * dia),
    ],
    calls: [
      sala('demo-sala-juegos', 'Noche de juegos', P('valentina'), 'public', null, 50 * min),
      sala('demo-sala-calculo', 'Estudio de cálculo II', P('santiago'), 'public', null, 25 * min),
      sala('demo-sala-viernes', 'Planes del viernes', YO, 'private', 'demo123456', 12 * min),
      sala('demo-sala-musica', 'Tertulia de música', P('camila'), 'private', 'demo654321', 70 * min),
      terminada('demo-fin-1', 'Maratón de series', P('mateo'), 3 * dia),
      terminada('demo-fin-2', 'Repaso de inglés', P('valentina'), dia + 3 * hora),
      terminada('demo-fin-3', 'Cumpleaños de Mateo', P('camila'), 8 * dia),
    ],
    call_messages: [
      msg('demo-sala-juegos', 1, P('valentina'), '¿Empezamos con el crucigrama o con las cartas?', 22 * min),
      msg('demo-sala-juegos', 2, P('mateo'), 'Cartas, que el crucigrama me da sueño 😅', 20 * min),
      msg('demo-sala-juegos', 3, P('camila'), 'Yo reparto, me toca', 18 * min),
      msg('demo-sala-calculo', 1, P('santiago'), 'Subí los ejercicios de integrales a la carpeta compartida', 15 * min),
      msg('demo-sala-viernes', 1, P('mateo'), '¿Hacemos pizza o salimos a comer?', 9 * min),
      msg('demo-sala-viernes', 2, P('camila'), 'Pizza en casa de alguien, hace frío', 7 * min),
    ],
    dm_threads: [hilo('valentina', 1), hilo('mateo', 2), hilo('camila', 3)],
    dm_messages: [
      dm(1, 1, P('valentina'), '¡Hola! ¿Te acordaste de traer el juego de cartas?', 3 * hora),
      dm(1, 2, YO, 'Sí, ya lo tengo. Lo llevo el viernes.', 3 * hora - 4 * min),
      dm(1, 3, P('valentina'), 'Perfecto 🙌 Entonces armamos sala a las ocho.', 40 * min),
      dm(2, 1, P('mateo'), 'Te mandé la lista de canciones para el viernes', 6 * hora),
      dm(2, 2, YO, 'La escucho esta noche y te digo.', 5 * hora + 50 * min),
    ],
    salas: {
      'demo-sala-juegos': { quien: [{ clave: 'valentina', mood: 'feliz', silenciado: false }, { clave: 'mateo', mood: 'none', silenciado: false }, { clave: 'camila', mood: 'none', silenciado: true }] },
      'demo-sala-calculo': { quien: [{ clave: 'santiago', mood: 'frustrado', silenciado: false }, { clave: 'lucia', mood: 'none', silenciado: false }] },
      'demo-sala-viernes': { quien: [{ clave: 'mateo', mood: 'emocionado', silenciado: false }, { clave: 'camila', mood: 'none', silenciado: false }] },
      'demo-sala-musica': { quien: [{ clave: 'camila', mood: 'enamorado', silenciado: false }, { clave: 'valentina', mood: 'none', silenciado: false }] },
    },
    respuestasDM: {
      [P('valentina')]: ['¡Genial! Gracias por avisar.', 'Jajaja, me encanta. Nos vemos en la sala.', 'Anotado 📌'],
      [P('mateo')]: ['Va, ahí te veo.', 'Jajaja buenísimo.', '¡Dale!'],
      [P('camila')]: ['Listo, quedamos así.', 'Perfecto, gracias.', '👍'],
      [P('santiago')]: ['Ok, gracias.', 'Quedo atento.', 'Hecho.'],
    },
    respuestasSala: ['Jajaja, de acuerdo.', 'Buena idea, me apunto.', 'Dame un minuto y vuelvo.', '¡Eso! Ya me estaba aburriendo.', 'Sí, yo también lo vi.'],
    entranteDM: { de: P('camila'), texto: '¿Entras a «Noche de juegos»? Ya estamos casi todos.', tras: 9000 },
  };
}
