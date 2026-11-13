import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Phone, PhoneOff, LogOut, Settings, Users, Globe, Lock, Link as LinkIcon, Check, CloudOff } from 'lucide-react';
import { Call, UserProfile, FriendWithProfile } from '../types';
import type { useFriends } from '../hooks/useFriends';
import FriendsPanel from './FriendsPanel';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import ChipEstado from './ui/ChipEstado';
import GrupoOpciones from './ui/GrupoOpciones';
import Medidor from './ui/Medidor';
import MensajeError from './ui/MensajeError';
import AvisoCopia from './ui/AvisoCopia';
import { esErrorDeRed, mensajeDeError } from '../lib/errores';

interface DashboardProps {
  userProfile: UserProfile;
  onJoinCall: (callId: string) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onStartDM: (friend: FriendWithProfile) => void;
  unreadByOther: Map<string, number>;
  totalUnread: number;
  notifPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<void>;
  friendsApi: ReturnType<typeof useFriends>;
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

function rowToCall(row: any): Call {
  return {
    id: row.id,
    name: row.name,
    creatorId: row.creator_id,
    status: row.status,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    visibility: row.visibility ?? 'public',
    inviteCode: row.invite_code ?? null,
  };
}

export default function Dashboard({
  userProfile,
  onJoinCall,
  onLogout,
  onOpenSettings,
  onStartDM,
  unreadByOther,
  totalUnread,
  notifPermission,
  requestNotificationPermission,
  friendsApi,
}: DashboardProps) {
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [endedCalls, setEndedCalls] = useState<Call[]>([]);
  const [newCallName, setNewCallName] = useState('');
  const [newCallVisibility, setNewCallVisibility] = useState<'public' | 'private'>('public');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<{ texto: string; red: boolean } | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedCallId, setCopiedCallId] = useState<string | null>(null);
  // Si el portapapeles falla: el enlace queda a la vista para copiarlo a mano
  const [enlaceSinCopiar, setEnlaceSinCopiar] = useState<string | null>(null);

  const { friends, received, sent, blocked, loading: friendsLoading, searchUsers, sendRequest, accept, reject, cancel, block, unblock } = friendsApi;

  const privateCalls = useMemo(() => activeCalls.filter((c) => c.visibility === 'private'), [activeCalls]);
  const publicCalls = useMemo(() => activeCalls.filter((c) => c.visibility === 'public'), [activeCalls]);

  const buildInviteLink = useCallback((code: string) => {
    const base = import.meta.env.BASE_URL || '/';
    return `${window.location.origin}${base}?invite=${code}`;
  }, []);

  const copyInvite = useCallback(async (call: Call) => {
    if (!call.inviteCode) return;
    try {
      await navigator.clipboard.writeText(buildInviteLink(call.inviteCode));
      setEnlaceSinCopiar(null);
      setCopiedCallId(call.id);
      setTimeout(() => setCopiedCallId((cur) => (cur === call.id ? null : cur)), 1500);
    } catch (err) {
      console.error('No se pudo copiar el link:', err);
      setEnlaceSinCopiar(buildInviteLink(call.inviteCode));
    }
  }, [buildInviteLink]);

  const refetch = useCallback(async () => {
    const activeThreshold = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
    const [activeResp, endedResp] = await Promise.all([
      supabase
        .from('calls')
        .select('*')
        .eq('status', 'active')
        .gte('last_active_at', activeThreshold)
        .order('created_at', { ascending: false }),
      supabase
        .from('calls')
        .select('*')
        .eq('status', 'ended')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    if (activeResp.error) console.error('Error cargando activas:', activeResp.error);
    if (endedResp.error) console.error('Error cargando historial:', endedResp.error);
    setActiveCalls((activeResp.data ?? []).map(rowToCall));
    setEndedCalls((endedResp.data ?? []).map(rowToCall));
  }, []);

  useEffect(() => {
    refetch();
    const channel = supabase
      .channel('calls-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const handleCreateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCallName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsCreating(false);
      return;
    }
    const inviteCode = newCallVisibility === 'private'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : null;
    const { data, error } = await supabase
      .from('calls')
      .insert({
        name: newCallName.trim(),
        creator_id: user.id,
        visibility: newCallVisibility,
        invite_code: inviteCode,
      })
      .select()
      .single();
    setIsCreating(false);
    if (error || !data) {
      console.error('Error creando llamada:', error);
      // Conserva lo escrito y dice qué pasó
      setCreateError({ texto: mensajeDeError(error ?? new Error('No se pudo crear la llamada.')), red: esErrorDeRed(error) });
      return;
    }
    setNewCallName('');
    onJoinCall(data.id);
  };

  // Procesa ?invite=XYZ en la URL al montar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (!code) return;
    (async () => {
      const { data, error } = await supabase.rpc('join_call_by_invite', { p_code: code });
      // Limpiar el query param siempre, exitoso o no.
      params.delete('invite');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
      if (error || typeof data !== 'string') {
        setInviteError(error?.message ?? 'Invitación inválida o llamada terminada');
        return;
      }
      onJoinCall(data);
    })();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendientes = received.length + totalUnread;

  /** Fila de sala: ratón en toda la fila, teclado en el botón «Entrar». */
  const filaSala = (call: Call, privada: boolean) => {
    const isMine = call.creatorId === userProfile.uid;
    const justCopied = copiedCallId === call.id;
    return (
      <motion.li
        key={call.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        className="card flex min-h-[72px] cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 p-4"
        onClick={() => onJoinCall(call.id)}
      >
        <Medidor segmentos={2} />
        <div className="min-w-0 flex-1 basis-44 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="break-words text-lg font-semibold">{call.name}</h3>
            {privada && (
              <ChipEstado icono={Lock} tono="accion">
                Privada
              </ChipEstado>
            )}
          </div>
          <p className="text-sm text-texto-secundario">Activa ahora</p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          {privada && isMine && call.inviteCode && (
            <Boton
              variante="plano"
              onClick={(e) => {
                e.stopPropagation();
                copyInvite(call);
              }}
              title={justCopied ? '¡Copiado!' : 'Copiar invite link'}
              aria-label="Copiar invite link"
            >
              {justCopied ? <Check size={20} aria-hidden="true" /> : <LinkIcon size={20} aria-hidden="true" />}
            </Boton>
          )}
          <Boton
            icono={<Phone size={20} aria-hidden="true" />}
            aria-label={`Entrar a ${call.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onJoinCall(call.id);
            }}
          >
            Entrar
          </Boton>
        </div>
      </motion.li>
    );
  };

  const vacio = (titulo: string, ayuda: string) => (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <Medidor segmentos={0} />
      <div className="space-y-1">
        <p className="font-medium">{titulo}</p>
        <p className="text-sm text-texto-secundario">{ayuda}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-fondo p-4 font-sans sm:p-6">
      <header className="mx-auto mb-10 flex max-w-[70rem] flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={userProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`}
            alt={userProfile.displayName}
            referrerPolicy="no-referrer"
            className="h-12 w-12 flex-none rounded-full border-2 border-separador"
          />
          <div className="min-w-0">
            {/* KallIt brand — dashboard header */}
            <div className="brand-kallit mb-1 text-marca leading-none">
              <span>Kall</span>
              <span className="brand-it">It</span>
            </div>
            <h1 className="break-words text-lg font-semibold">Hola, {userProfile.displayName}</h1>
            <p className="text-sm text-texto-secundario">¿Listo para una comunicación auténtica?</p>
          </div>
        </div>
        <div className="ml-auto flex gap-1">
          <Boton
            variante="plano"
            onClick={() => setFriendsOpen(true)}
            aria-label={pendientes > 0 ? `Amigos, ${pendientes} pendientes` : 'Amigos'}
            aria-haspopup="dialog"
            aria-expanded={friendsOpen}
          >
            <Users size={20} aria-hidden="true" />
            <span className="hidden md:inline">Amigos</span>
            {pendientes > 0 && (
              <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-xs font-bold text-sobre-peligro">
                {pendientes}
              </span>
            )}
          </Boton>
          <Boton variante="plano" onClick={onOpenSettings} aria-label="Ajustes" aria-haspopup="dialog">
            <Settings size={20} aria-hidden="true" />
            <span className="hidden md:inline">Ajustes</span>
          </Boton>
          <Boton variante="plano" tono="peligro" data-fijo="" onClick={onLogout} aria-label="Cerrar sesión">
            <LogOut size={20} aria-hidden="true" />
            <span className="hidden md:inline">Cerrar sesión</span>
          </Boton>
        </div>
      </header>

      <AvisoCopia enlace={enlaceSinCopiar} onCerrar={() => setEnlaceSinCopiar(null)} className="mx-auto mb-6 max-w-[70rem]" />

      <main className="mx-auto grid max-w-[70rem] grid-cols-1 gap-8 lg:grid-cols-3">
        {/* New Call Section */}
        <section className="space-y-4 lg:col-span-1" aria-labelledby="titulo-iniciar">
          <div className="card space-y-6 p-6">
            <div className="space-y-1">
              <h2 id="titulo-iniciar" className="flex items-center gap-2 text-xl font-semibold">
                <Plus size={20} className="text-texto-secundario" aria-hidden="true" /> Iniciar
              </h2>
              <p className="text-sm text-texto-secundario">Nueva Comunicación</p>
            </div>
            <form
              onSubmit={handleCreateCall}
              className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto] md:items-end lg:grid-cols-1 lg:items-stretch"
            >
              <Campo
                etiqueta="Nombre de la sala"
                type="text"
                placeholder="Nombre de la sala..."
                value={newCallName}
                onChange={(e) => setNewCallName(e.target.value)}
                autoComplete="off"
                fondo
                required
              />
              <GrupoOpciones
                leyenda="Visibilidad de la sala"
                leyendaOculta
                nombre="visibilidad-sala"
                valor={newCallVisibility}
                onCambio={(v) => setNewCallVisibility(v as 'public' | 'private')}
                llenar
                opciones={[
                  { valor: 'public', etiqueta: 'Pública', icono: <Globe size={20} aria-hidden="true" />, describedBy: 'ayuda-visibilidad' },
                  { valor: 'private', etiqueta: 'Privada', icono: <Lock size={20} aria-hidden="true" />, describedBy: 'ayuda-visibilidad' },
                ]}
              />
              <Boton type="submit" tamano="lg" cargando={isCreating} icono={isCreating ? undefined : <Phone size={20} aria-hidden="true" />} className="md:min-w-44 lg:w-full">
                {isCreating ? 'Iniciando...' : 'Crear Llamada'}
              </Boton>
              <p id="ayuda-visibilidad" className="text-sm text-texto-secundario md:col-span-3 lg:col-span-1">
                {newCallVisibility === 'public'
                  ? 'Cualquier persona puede unirse.'
                  : 'Solo amigos la verán listada. Recibirás un link para invitar a no-amigos.'}
              </p>
              {createError && (
                <MensajeError icono={createError.red ? CloudOff : undefined} className="md:col-span-3 lg:col-span-1">
                  {createError.texto}
                </MensajeError>
              )}
            </form>
            <AnimatePresence>
              {inviteError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                  onClick={() => setInviteError(null)}
                >
                  <MensajeError>{inviteError}</MensajeError>
                  <Boton variante="terciario" onClick={() => setInviteError(null)}>
                    Cerrar
                  </Boton>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Active Calls Section */}
        <section className="space-y-10 lg:col-span-2">
          {/* Privadas */}
          <div className="space-y-4" aria-labelledby="titulo-privadas" role="region">
            <div className="flex items-center justify-between gap-3">
              <h2 id="titulo-privadas" className="flex items-center gap-2 text-xl font-semibold">
                <Lock size={20} className="text-texto-secundario" aria-hidden="true" /> Privadas (amigos)
              </h2>
              {privateCalls.length > 0 && (
                <span className="chip tabular-nums">
                  {privateCalls.length}
                  <span className="sr-only"> salas</span>
                </span>
              )}
            </div>
            {privateCalls.length === 0 ? (
              vacio('Sin llamadas privadas activas.', 'Crea una privada para coordinarte con tus amigos.')
            ) : (
              <ul className="grid grid-cols-1 gap-3">{privateCalls.map((call) => filaSala(call, true))}</ul>
            )}
          </div>

          {/* Públicas */}
          <div className="space-y-4" aria-labelledby="titulo-publicas" role="region">
            <div className="flex items-center justify-between gap-3">
              <h2 id="titulo-publicas" className="flex items-center gap-2 text-xl font-semibold">
                <Globe size={20} className="text-texto-secundario" aria-hidden="true" /> Públicas
              </h2>
              {publicCalls.length > 0 && (
                <span className="chip tabular-nums">
                  {publicCalls.length}
                  <span className="sr-only"> salas</span>
                </span>
              )}
            </div>
            {publicCalls.length === 0 ? (
              vacio('No hay comunicaciones públicas activas.', 'Sé el primero en iniciar una.')
            ) : (
              <ul className="grid grid-cols-1 gap-3">{publicCalls.map((call) => filaSala(call, false))}</ul>
            )}
          </div>

          {/* History Section */}
          <div className="space-y-4 border-t border-separador pt-8" aria-labelledby="titulo-historial" role="region">
            <h2 id="titulo-historial" className="text-xl font-semibold">
              Historial Reciente
            </h2>
            {endedCalls.length === 0 ? (
              <p className="text-sm text-texto-secundario">El historial aparecerá aquí.</p>
            ) : (
              <ul className="space-y-2">
                {endedCalls.map((call) => (
                  <li key={call.id} className="card flex items-center gap-3 px-4 py-3">
                    <PhoneOff size={16} className="flex-none text-texto-secundario" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="break-words font-medium">{call.name}</h3>
                      <p className="text-sm text-texto-secundario">Finalizada • {new Date(call.createdAt).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <FriendsPanel
        myUid={userProfile.uid}
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        onStartDM={onStartDM}
        friends={friends}
        received={received}
        sent={sent}
        blocked={blocked}
        loading={friendsLoading}
        searchUsers={searchUsers}
        sendRequest={sendRequest}
        accept={accept}
        reject={reject}
        cancel={cancel}
        block={block}
        unblock={unblock}
        unreadByOther={unreadByOther}
        notifPermission={notifPermission}
        requestNotificationPermission={requestNotificationPermission}
      />

      {friendsOpen && <div data-no-inert="" className="velo fixed inset-0 z-40" onClick={() => setFriendsOpen(false)} aria-hidden="true" />}

      {/* Anuncio del estado de copia para lectores de pantalla */}
      <span role="status" aria-live="polite" className="sr-only">
        {copiedCallId ? '¡Copiado!' : ''}
      </span>
    </div>
  );
}
