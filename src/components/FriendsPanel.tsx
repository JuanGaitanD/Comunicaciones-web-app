import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, UserPlus, UserCheck, UserX, Users, MessageSquare, UserMinus, Shield, ChevronDown, Bell, Check, Clock } from 'lucide-react';
import type { FriendWithProfile } from '../types';
import type { SearchResult } from '../hooks/useFriends';
import { cn } from '../lib/utils';
import { useDialogo } from '../hooks/useDialogo';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import Medidor from './ui/Medidor';
import MensajeError from './ui/MensajeError';
import ChipEstado from './ui/ChipEstado';

interface FriendsPanelProps {
  myUid: string;
  open: boolean;
  onClose: () => void;
  onStartDM: (friend: FriendWithProfile) => void;
  friends: FriendWithProfile[];
  received: FriendWithProfile[];
  sent: FriendWithProfile[];
  blocked: FriendWithProfile[];
  loading: boolean;
  searchUsers: (query: string) => Promise<SearchResult[]>;
  sendRequest: (targetUid: string) => Promise<void>;
  accept: (f: FriendWithProfile) => Promise<void>;
  reject: (f: FriendWithProfile) => Promise<void>;
  cancel: (f: FriendWithProfile) => Promise<void>;
  block: (f: FriendWithProfile) => Promise<void>;
  unblock: (f: FriendWithProfile) => Promise<void>;
  unreadByOther: Map<string, number>;
  notifPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<void>;
}

type Tab = 'friends' | 'requests';

export default function FriendsPanel({
  myUid,
  open,
  onClose,
  onStartDM,
  friends,
  received,
  sent,
  blocked,
  loading,
  searchUsers,
  sendRequest,
  accept,
  reject,
  cancel,
  block,
  unblock,
  unreadByOther,
  notifPermission,
  requestNotificationPermission,
}: FriendsPanelProps) {
  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [showBlocked, setShowBlocked] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);

  // Diálogo modal: foco al campo de búsqueda, Tab contenido, Escape cierra y el foco vuelve a «Amigos»
  useDialogo({ ref: panelRef, abierto: open, onCerrar: onClose, focoInicial: busquedaRef });

  // Deriva la relación actual en tiempo real desde el estado del hook (no del snapshot del search).
  function liveRelation(uid: string): 'friends' | 'sent' | 'received' | 'none' {
    if (friends.some((f) => f.otherUid === uid)) return 'friends';
    if (sent.some((f) => f.otherUid === uid)) return 'sent';
    if (received.some((f) => f.otherUid === uid)) return 'received';
    return 'none';
  }

  // Limpia `pending` para uids que ya no están en `sent` (rechazados/cancelados por CDC).
  useEffect(() => {
    setPending((prev) => {
      const next = new Map(prev);
      for (const uid of [...next.keys()]) {
        if (!sent.some((f) => f.otherUid === uid)) next.delete(uid);
      }
      return next;
    });
  }, [sent]);

  const runSearch = useCallback(
    async (q: string) => {
      setSearchError('');
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      const results = await searchUsers(q);
      setSearchResults(results);
    },
    [searchUsers]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSendRequest = useCallback(
    async (uid: string) => {
      if (pending.get(uid)) return;
      setPending((prev) => new Map(prev).set(uid, true));
      try {
        await sendRequest(uid);
      } catch (err: any) {
        setSearchError(err?.message ?? 'Error enviando solicitud');
        setPending((prev) => new Map(prev).set(uid, false));
      }
    },
    [pending, sendRequest]
  );

  function relationLabel(rel: ReturnType<typeof liveRelation>): string {
    if (rel === 'friends') return 'Ya son amigos';
    if (rel === 'sent') return 'Solicitud enviada';
    if (rel === 'received') return 'Aceptar';
    return 'Agregar';
  }

  const avatar = (uid: string, url: string | null | undefined, nombre: string, tam = 'h-10 w-10') => (
    <img
      src={url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
      alt={nombre}
      referrerPolicy="no-referrer"
      className={cn(tam, 'flex-none rounded-full')}
    />
  );

  const fila = 'flex items-center gap-3 rounded-contenedor bg-fondo p-3';
  const pestana = (activa: boolean) =>
    cn(
      'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control px-3 text-base transition-colors',
      activa ? 'bg-superficie font-semibold text-texto' : 'font-medium text-texto-secundario hover:text-texto'
    );

  const vacio = (texto: string) => (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Medidor segmentos={0} />
      <p className="max-w-[16rem] text-texto-secundario">{texto}</p>
    </div>
  );

  const alPulsarPestana = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nuevo: Tab = e.key === 'ArrowLeft' ? 'friends' : 'requests';
      setTab(nuevo);
      document.getElementById(nuevo === 'friends' ? 'pestana-amigos' : 'pestana-solicitudes')?.focus();
    }
  };

  return (
    <motion.aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-amigos"
      inert={!open}
      initial={false}
      animate={{ x: open ? 0 : '100%' }}
      transition={{ type: 'tween', duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className="panel-lateral fixed right-0 top-0 z-50 flex h-dvh w-full flex-col bg-superficie md:w-[400px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-separador px-4 py-3">
        <h2 id="titulo-amigos" className="flex items-center gap-2 text-xl font-semibold">
          <Users size={20} className="text-texto-secundario" aria-hidden="true" /> Amigos
        </h2>
        <div className="flex items-center gap-1">
          {notifPermission === 'default' && (
            <Boton
              variante="plano"
              onClick={requestNotificationPermission}
              title="Habilitar notificaciones"
              aria-label="Habilitar notificaciones"
            >
              <Bell size={20} aria-hidden="true" />
            </Boton>
          )}
          <Boton variante="plano" onClick={onClose} aria-label="Cerrar">
            <X size={20} aria-hidden="true" />
          </Boton>
        </div>
      </div>

      {/* Notification invite banner */}
      <AnimatePresence initial={false}>
        {notifPermission === 'default' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <div className="mx-4 mt-3 flex items-center gap-3 rounded-contenedor bg-fondo-alterno px-4 py-3">
              <Bell size={20} className="flex-none text-accion-tinta" aria-hidden="true" />
              <p className="flex-1 text-sm text-texto-secundario">Activa las notificaciones para saber cuando te escriben.</p>
              <Boton variante="terciario" onClick={requestNotificationPermission}>
                Activar
              </Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="border-b border-separador p-4">
        <Campo
          ref={busquedaRef}
          type="text"
          icono={Search}
          aria-label="Buscar usuarios"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar usuarios..."
          fondo
        />
        {searchError && <MensajeError className="mt-3">{searchError}</MensajeError>}

        <AnimatePresence>
          {query.trim() && searchResults.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="mt-3 space-y-2"
            >
              {searchResults.map((r) => {
                const rel = liveRelation(r.uid);
                const isPending = pending.get(r.uid) ?? false;
                const canAdd = rel === 'none' && !isPending;
                return (
                  <motion.li key={r.uid} layout className={fila}>
                    {avatar(r.uid, r.photoURL, r.displayName)}
                    <span className="min-w-0 flex-1 truncate font-medium">{r.displayName}</span>
                    {rel === 'none' ? (
                      <Boton
                        variante="secundario"
                        cargando={isPending}
                        disabled={!canAdd}
                        onClick={() => canAdd && handleSendRequest(r.uid)}
                        icono={<UserPlus size={20} aria-hidden="true" />}
                        className="flex-none"
                      >
                        {isPending ? 'Enviando...' : 'Agregar'}
                      </Boton>
                    ) : (
                      <ChipEstado
                        icono={rel === 'friends' ? Check : rel === 'sent' ? Clock : undefined}
                        className="flex-none"
                      >
                        {relationLabel(rel)}
                      </ChipEstado>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
          {query.trim() && searchResults.length === 0 && !loading && (
            <p className="mt-3 text-center text-sm text-texto-secundario">No se encontraron usuarios.</p>
          )}
        </AnimatePresence>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Amigos y solicitudes" onKeyDown={alPulsarPestana} className="mx-4 mt-3 flex gap-1 rounded-contenedor bg-fondo-alterno p-1">
        <button
          id="pestana-amigos"
          type="button"
          role="tab"
          aria-selected={tab === 'friends'}
          aria-controls="contenido-amigos"
          tabIndex={tab === 'friends' ? 0 : -1}
          onClick={() => setTab('friends')}
          className={pestana(tab === 'friends')}
        >
          <Users size={20} aria-hidden="true" /> Amigos
          {friends.length > 0 && <span className="chip bg-fondo tabular-nums">{friends.length}</span>}
        </button>
        <button
          id="pestana-solicitudes"
          type="button"
          role="tab"
          aria-selected={tab === 'requests'}
          aria-controls="contenido-amigos"
          tabIndex={tab === 'requests' ? 0 : -1}
          onClick={() => setTab('requests')}
          className={pestana(tab === 'requests')}
        >
          <UserPlus size={20} aria-hidden="true" /> Solicitudes
          {received.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1.5 text-xs font-bold tabular-nums text-sobre-peligro">
              {received.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div
        id="contenido-amigos"
        role="tabpanel"
        aria-labelledby={tab === 'friends' ? 'pestana-amigos' : 'pestana-solicitudes'}
        className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4"
      >
        {loading ? (
          <p className="py-8 text-center text-texto-secundario" role="status">
            Cargando...
          </p>
        ) : tab === 'friends' ? (
          <>
            {friends.length === 0 ? (
              vacio('Aún no tienes amigos. ¡Busca y agrega a alguien!')
            ) : (
              <AnimatePresence>
                {friends.map((f) => {
                  const sinLeer = unreadByOther.get(f.otherUid) ?? 0;
                  const nombre = f.otherProfile.displayName;
                  return (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className={fila}
                    >
                      {avatar(f.otherUid, f.otherProfile.photoURL, nombre)}
                      <span className="min-w-0 flex-1 truncate font-semibold">{nombre}</span>
                      <div className="flex gap-1">
                        <Boton
                          variante="plano"
                          tono="accion"
                          onClick={() => {
                            onStartDM(f);
                            onClose();
                          }}
                          title="Mensaje"
                          aria-label={sinLeer > 0 ? `Enviar mensaje a ${nombre}, ${sinLeer} sin leer` : `Enviar mensaje a ${nombre}`}
                          className="relative"
                        >
                          <MessageSquare size={20} aria-hidden="true" />
                          {sinLeer > 0 && (
                            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-xs font-bold text-sobre-peligro">
                              {sinLeer}
                            </span>
                          )}
                        </Boton>
                        <Boton variante="plano" tono="peligro" onClick={() => block(f)} title="Bloquear" aria-label={`Bloquear a ${nombre}`}>
                          <UserMinus size={20} aria-hidden="true" />
                        </Boton>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </>
        ) : (
          <>
            {received.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-sm font-semibold text-texto-secundario">Recibidas</h3>
                <AnimatePresence>
                  {received.map((f) => (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className={fila}
                    >
                      {avatar(f.otherUid, f.otherProfile.photoURL, f.otherProfile.displayName)}
                      <span className="min-w-0 flex-1 truncate font-semibold">{f.otherProfile.displayName}</span>
                      <div className="flex gap-1">
                        <Boton variante="plano" tono="accion" onClick={() => accept(f)} title="Aceptar" aria-label={`Aceptar a ${f.otherProfile.displayName}`}>
                          <UserCheck size={20} aria-hidden="true" />
                        </Boton>
                        <Boton variante="plano" tono="peligro" onClick={() => reject(f)} title="Rechazar" aria-label={`Rechazar a ${f.otherProfile.displayName}`}>
                          <UserX size={20} aria-hidden="true" />
                        </Boton>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {sent.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-sm font-semibold text-texto-secundario">Enviadas</h3>
                <AnimatePresence>
                  {sent.map((f) => (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className={fila}
                    >
                      {avatar(f.otherUid, f.otherProfile.photoURL, f.otherProfile.displayName)}
                      <span className="min-w-0 flex-1 truncate font-semibold">{f.otherProfile.displayName}</span>
                      <Boton
                        variante="plano"
                        tono="peligro"
                        onClick={() => cancel(f)}
                        title="Cancelar solicitud"
                        aria-label={`Cancelar solicitud a ${f.otherProfile.displayName}`}
                      >
                        <UserX size={20} aria-hidden="true" />
                      </Boton>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {received.length === 0 && sent.length === 0 && vacio('No hay solicitudes pendientes.')}
          </>
        )}
      </div>

      {/* Footer: usuarios bloqueados */}
      {blocked.length > 0 && (
        <div className="flex-shrink-0 border-t border-separador bg-fondo-alterno">
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            aria-expanded={showBlocked}
            aria-controls="lista-bloqueados"
            className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-base font-medium text-texto-secundario hover:text-texto"
          >
            <span className="flex items-center gap-2">
              <Shield size={20} aria-hidden="true" />
              Usuarios bloqueados ({blocked.length})
            </span>
            <ChevronDown size={20} aria-hidden="true" className={cn('transition-transform duration-150', showBlocked && 'rotate-180')} />
          </button>
          {showBlocked && (
            <div id="lista-bloqueados" className="scrollbar-thin max-h-48 space-y-2 overflow-y-auto px-4 pb-4 pt-1">
              {blocked.map((f) => (
                <div key={f.otherUid} className="flex items-center gap-3 rounded-contenedor bg-superficie p-3">
                  {avatar(f.otherUid, f.otherProfile.photoURL, f.otherProfile.displayName, 'h-9 w-9')}
                  <span className="min-w-0 flex-1 truncate font-medium">{f.otherProfile.displayName}</span>
                  <Boton
                    variante="secundario"
                    className="flex-none"
                    aria-label={`Desbloquear a ${f.otherProfile.displayName}`}
                    onClick={async () => {
                      try {
                        await unblock(f);
                      } catch (err) {
                        console.error('Error desbloqueando:', err);
                      }
                    }}
                  >
                    Desbloquear
                  </Boton>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.aside>
  );
}
