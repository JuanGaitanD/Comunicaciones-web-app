/**
 * Cliente de Supabase simulado, en memoria, solo para el modo demo. Imita la parte de la API que usa la
 * app (consultas con filtros, canales de cambios, presencia y broadcast, RPC y sesión) sobre los datos
 * de ejemplo de `datos.ts`. No hace ninguna petición de red y nada de lo que se haga sale del navegador
 * ni se guarda: al salir de la demo o recargar, todo vuelve a empezar.
 */
import { crearSemilla, PERSONAS, YO, type Semilla } from './datos';

type Fila = Record<string, any>;
type Evento = 'INSERT' | 'UPDATE' | 'DELETE';

const ahoraIso = () => new Date().toISOString();
const nuevoId = () => `demo-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
const fallo = (message: string, code?: string) => ({ message, code, details: '', hint: '', name: 'DemoError' });

export function crearCliente(alSalir: () => void) {
  const semilla: Semilla = crearSemilla();
  const tablas: Record<string, Fila[]> = {
    profiles: semilla.profiles,
    friendships: semilla.friendships,
    calls: semilla.calls,
    call_messages: semilla.call_messages,
    dm_threads: semilla.dm_threads,
    dm_messages: semilla.dm_messages,
  };
  const canales = new Set<Canal>();
  const pendientes = new Set<ReturnType<typeof setTimeout>>();
  const oyentesAuth = new Set<(evento: string, sesion: unknown) => void>();
  /** Quién hay «conectado» ahora en cada sala en la que estoy (para las respuestas del chat). */
  const enSala = new Map<string, string[]>();
  let vivo = true;
  let turnoRespuesta = 0;

  const tras = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      pendientes.delete(id);
      if (vivo) fn();
    }, ms);
    pendientes.add(id);
    return id;
  };

  const sesion = { access_token: 'demo', user: { id: YO, email: 'demo@ejemplo.invalid', user_metadata: {} } };

  // ───────── Cambios en tiempo real (postgres_changes) ─────────
  const coincideFiltro = (filtro: string | undefined, fila: Fila) => {
    if (!filtro) return true;
    const m = /^(\w+)=(eq|neq)\.(.*)$/.exec(filtro);
    if (!m) return true;
    const igual = String(fila[m[1]]) === m[3];
    return m[2] === 'eq' ? igual : !igual;
  };

  const emitir = (tabla: string, evento: Evento, nuevo: Fila | null, viejo: Fila | null) => {
    const carga = { eventType: evento, schema: 'public', table: tabla, new: nuevo ?? {}, old: viejo ?? {}, commit_timestamp: ahoraIso() };
    for (const canal of [...canales]) {
      for (const h of canal.manejadores) {
        if (h.tipo !== 'postgres_changes' || h.filtro?.table !== tabla) continue;
        if (h.filtro.event !== '*' && h.filtro.event !== evento) continue;
        if (!coincideFiltro(h.filtro.filter, (nuevo ?? viejo) as Fila)) continue;
        tras(() => h.cb(carga), 0);
      }
    }
  };

  // ───────── Guion: respuestas de las personas de ejemplo ─────────
  const insertar = (tabla: string, fila: Fila) => {
    const f: Fila = { id: nuevoId(), created_at: ahoraIso(), ...fila };
    tablas[tabla].push(f);
    emitir(tabla, 'INSERT', f, null);
    return f;
  };

  const alInsertar = (tabla: string, fila: Fila) => {
    if (tabla === 'dm_messages') {
      const hilo = tablas.dm_threads.find((t) => t.id === fila.thread_id);
      if (hilo) hilo.last_message_at = fila.created_at;
      if (hilo && fila.sender_id === YO) {
        const otro = hilo.user_a_id === YO ? hilo.user_b_id : hilo.user_a_id;
        const banco = semilla.respuestasDM[otro] ?? ['Gracias por escribir.'];
        tras(() => insertar('dm_messages', { thread_id: hilo.id, sender_id: otro, body: banco[turnoRespuesta++ % banco.length] }), 1600);
      }
    }
    if (tabla === 'call_messages' && fila.sender_id === YO) {
      const presentes = enSala.get(fila.call_id) ?? [];
      if (presentes.length) {
        const quien = presentes[turnoRespuesta % presentes.length];
        const body = semilla.respuestasSala[turnoRespuesta++ % semilla.respuestasSala.length];
        tras(() => insertar('call_messages', { call_id: fila.call_id, sender_id: quien, body }), 2000);
      }
    }
  };

  // Un mensaje directo entrante a los pocos segundos de entrar (muestra la insignia de no leídos)
  tras(() => insertar('dm_messages', { thread_id: 'demo-dm-3', sender_id: semilla.entranteDM.de, body: semilla.entranteDM.texto }), semilla.entranteDM.tras);

  // Las salas de ejemplo siguen «activas ahora» mientras dure la visita (la lista oculta las de más de 5 min)
  const latido = setInterval(() => {
    const t = ahoraIso();
    for (const c of tablas.calls) if (c.status === 'active') c.last_active_at = t;
  }, 60_000);

  // ───────── Consultas ─────────
  class Consulta implements PromiseLike<{ data: any; error: any }> {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private cols = '*';
    private valores: Fila[] = [];
    private parche: Fila = {};
    private filtros: ((f: Fila) => boolean)[] = [];
    private orden: { col: string; asc: boolean } | null = null;
    private tope: number | null = null;
    private modo: 'lista' | 'uno' | 'quizas' = 'lista';
    private devolver = false;
    constructor(private tabla: string) {}

    select(cols = '*') {
      this.cols = cols;
      if (this.op !== 'select') this.devolver = true;
      return this;
    }
    insert(v: Fila | Fila[]) {
      this.op = 'insert';
      this.valores = Array.isArray(v) ? v : [v];
      return this;
    }
    update(p: Fila) {
      this.op = 'update';
      this.parche = p;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    eq(c: string, v: unknown) {
      this.filtros.push((f) => f[c] === v);
      return this;
    }
    neq(c: string, v: unknown) {
      this.filtros.push((f) => f[c] !== v);
      return this;
    }
    gte(c: string, v: string) {
      this.filtros.push((f) => String(f[c]) >= v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filtros.push((f) => vs.includes(f[c]));
      return this;
    }
    ilike(c: string, patron: string) {
      const re = new RegExp(`^${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
      this.filtros.push((f) => re.test(String(f[c] ?? '')));
      return this;
    }
    or(expr: string) {
      const alternativas = expr.split(',').map((parte) => {
        const [col, op, ...resto] = parte.split('.');
        const valor = resto.join('.');
        return (f: Fila) => (op === 'eq' ? String(f[col]) === valor : String(f[col]) !== valor);
      });
      this.filtros.push((f) => alternativas.some((g) => g(f)));
      return this;
    }
    order(col: string, o: { ascending?: boolean } = {}) {
      this.orden = { col, asc: o.ascending ?? true };
      return this;
    }
    limit(n: number) {
      this.tope = n;
      return this;
    }
    single() {
      this.modo = 'uno';
      return this;
    }
    maybeSingle() {
      this.modo = 'quizas';
      return this;
    }
    then<A, B>(res?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, rej?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return this.ejecutar().then(res, rej);
    }

    private proyectar(f: Fila): Fila {
      if (this.cols === '*') return { ...f };
      return Object.fromEntries(this.cols.split(',').map((c) => c.trim()).map((c) => [c, f[c]]));
    }

    private entregar(filas: Fila[]) {
      const salida = filas.map((f) => this.proyectar(f));
      if (this.modo === 'lista') return { data: salida, error: null };
      if (salida.length === 1) return { data: salida[0], error: null };
      if (salida.length === 0 && this.modo === 'quizas') return { data: null, error: null };
      return { data: null, error: fallo('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
    }

    private async ejecutar(): Promise<{ data: any; error: any }> {
      await new Promise((r) => tras(() => r(null), 25));
      const t = tablas[this.tabla];
      const coinciden = () => t.filter((f) => this.filtros.every((g) => g(f)));

      if (this.op === 'select') {
        let filas = coinciden();
        if (this.orden) {
          const { col, asc } = this.orden;
          filas = [...filas].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
        }
        if (this.tope !== null) filas = filas.slice(0, this.tope);
        return this.entregar(filas);
      }

      if (this.op === 'insert') {
        const creadas: Fila[] = [];
        for (const v of this.valores) {
          const f: Fila = { id: nuevoId(), created_at: ahoraIso(), ...v };
          if (this.tabla === 'calls') Object.assign(f, { status: 'active', visibility: 'public', invite_code: null, last_active_at: ahoraIso(), ended_at: null, ...v });
          if (this.tabla === 'friendships' || this.tabla === 'dm_threads') {
            if (t.some((x) => x.user_a_id === f.user_a_id && x.user_b_id === f.user_b_id)) return { data: null, error: fallo('duplicate key value', '23505') };
            if (this.tabla === 'friendships') Object.assign(f, { updated_at: f.created_at });
            else Object.assign(f, { last_message_at: f.created_at });
          }
          t.push(f);
          creadas.push(f);
          emitir(this.tabla, 'INSERT', f, null);
          alInsertar(this.tabla, f);
        }
        return this.devolver ? this.entregar(creadas) : { data: null, error: null };
      }

      const afectadas = coinciden();
      if (this.op === 'update') {
        for (const f of afectadas) {
          const viejo = { ...f };
          Object.assign(f, this.parche);
          if ('updated_at' in f) f.updated_at = ahoraIso();
          emitir(this.tabla, 'UPDATE', f, viejo);
        }
        return this.devolver ? this.entregar(afectadas) : { data: null, error: null };
      }

      for (const f of afectadas) {
        t.splice(t.indexOf(f), 1);
        emitir(this.tabla, 'DELETE', null, f);
      }
      return { data: null, error: null };
    }
  }

  // ───────── Canales: presencia, broadcast y cambios ─────────
  class Canal {
    readonly __demo = true;
    readonly topic: string;
    readonly manejadores: { tipo: string; filtro: any; cb: (...a: any[]) => void }[] = [];
    private presencia: Record<string, Fila[]> = {};
    private clave: string;
    private cerrado = false;
    constructor(nombre: string, config?: any) {
      this.topic = `realtime:${nombre}`;
      this.clave = config?.config?.presence?.key ?? 'anon';
    }
    on(tipo: string, filtro: any, cb: (...a: any[]) => void) {
      this.manejadores.push({ tipo, filtro, cb });
      return this;
    }
    subscribe(cb?: (estado: string) => void) {
      canales.add(this);
      tras(() => !this.cerrado && cb?.('SUBSCRIBED'), 10);
      return this;
    }
    presenceState() {
      return JSON.parse(JSON.stringify(this.presencia));
    }
    async track(carga: Fila) {
      this.presencia[this.clave] = [{ ...carga, presence_ref: nuevoId() }];
      this.sincronizar();
      if (this.topic.startsWith('realtime:call:')) this.abrirSala(this.topic.slice('realtime:call:'.length));
      return 'ok';
    }
    async untrack() {
      delete this.presencia[this.clave];
      return 'ok';
    }
    async send(_mensaje: { type: string; event: string; payload: unknown }) {
      // Lo que mandaría esta persona (estado, solicitudes) no llega a nadie: no hay nadie al otro lado.
      return 'ok';
    }
    unsubscribe() {
      this.cerrar();
      return Promise.resolve('ok');
    }
    cerrar() {
      this.cerrado = true;
      this.manejadores.length = 0;
      canales.delete(this);
      if (this.topic.startsWith('realtime:call:')) enSala.delete(this.topic.slice('realtime:call:'.length));
      for (const id of this.temporizadores) clearInterval(id);
    }

    private temporizadores: ReturnType<typeof setInterval>[] = [];

    private sincronizar() {
      for (const h of this.manejadores) if (h.tipo === 'presence' && h.filtro?.event === 'sync') h.cb();
    }
    private difundir(evento: string, carga: unknown) {
      for (const h of this.manejadores) if (h.tipo === 'broadcast' && h.filtro?.event === evento) h.cb({ type: 'broadcast', event: evento, payload: carga });
    }

    /** Las personas de ejemplo entran a la sala de una en una y cambian de ánimo o de micro de vez en cuando. */
    private abrirSala(llamadaId: string) {
      const guion = semilla.salas[llamadaId]?.quien ?? [
        { clave: 'valentina', mood: 'feliz', silenciado: false },
        { clave: 'mateo', mood: 'none', silenciado: false },
      ];
      const aparecidos: string[] = [];
      enSala.set(llamadaId, aparecidos);
      const estado: Record<string, { mood: string; silenciado: boolean }> = {};
      guion.forEach((p, i) => {
        const persona = PERSONAS[p.clave];
        tras(() => {
          if (this.cerrado) return;
          this.presencia[persona.id] = [{ displayName: persona.nombre, photoURL: tablas.profiles.find((x) => x.id === persona.id)?.photo_url ?? '', joinedAt: ahoraIso(), presence_ref: nuevoId() }];
          aparecidos.push(persona.id);
          estado[persona.id] = { mood: p.mood, silenciado: p.silenciado };
          this.sincronizar();
          this.difundir('peer-state', { uid: persona.id, mood: p.mood, isMuted: p.silenciado, isSharingScreen: false });
        }, 350 * (i + 1));
      });
      const MOODS = ['feliz', 'emocionado', 'enamorado', 'perdido', 'none'];
      let vuelta = 0;
      this.temporizadores.push(
        setInterval(() => {
          if (this.cerrado || !vivo || aparecidos.length === 0) return;
          const uid = aparecidos[vuelta % aparecidos.length];
          const e = estado[uid];
          if (vuelta % 3 === 1) e.silenciado = !e.silenciado;
          else e.mood = MOODS[(vuelta + 1) % MOODS.length];
          this.difundir('peer-state', { uid, mood: e.mood, isMuted: e.silenciado, isSharingScreen: false });
          vuelta++;
        }, 11_000)
      );
    }
  }

  // ───────── Funciones RPC ─────────
  const rpc = async (nombre: string, args: Fila = {}) => {
    await new Promise((r) => tras(() => r(null), 25));
    if (nombre === 'touch_call') {
      const c = tablas.calls.find((x) => x.id === args.p_call_id);
      if (c) c.last_active_at = ahoraIso();
      return { data: null, error: null };
    }
    if (nombre === 'join_call_by_invite') {
      const c = tablas.calls.find((x) => x.invite_code === args.p_code && x.status === 'active');
      return c ? { data: c.id, error: null } : { data: null, error: fallo('Invitación inválida o llamada terminada') };
    }
    return { data: null, error: fallo(`La demo no incluye la función ${nombre}`) };
  };

  // ───────── Sesión ─────────
  const sinCuentas = async () => ({ data: { user: null, session: null }, error: fallo('En la demo no hay cuentas: usa «Probar la demo».') });
  const auth = {
    getSession: async () => ({ data: { session: sesion }, error: null }),
    getUser: async () => ({ data: { user: sesion.user }, error: null }),
    onAuthStateChange: (cb: (evento: string, s: unknown) => void) => {
      oyentesAuth.add(cb);
      return { data: { subscription: { unsubscribe: () => oyentesAuth.delete(cb) } } };
    },
    signOut: async () => {
      alSalir();
      return { error: null };
    },
    signInWithPassword: sinCuentas,
    signUp: sinCuentas,
    signInWithOAuth: sinCuentas,
  };

  const cliente = {
    from: (tabla: string) => new Consulta(tabla),
    rpc,
    auth,
    channel: (nombre: string, config?: unknown) => new Canal(nombre, config),
    getChannels: () => [...canales],
    removeChannel: async (c: { cerrar?: () => void }) => {
      c?.cerrar?.();
      return 'ok';
    },
  };

  const cerrar = () => {
    vivo = false;
    clearInterval(latido);
    for (const id of pendientes) clearTimeout(id);
    pendientes.clear();
    for (const c of [...canales]) c.cerrar();
    oyentesAuth.clear();
  };

  return { cliente, cerrar };
}
