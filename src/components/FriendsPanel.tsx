import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, UserPlus, UserCheck, UserX, Users, MessageSquare, UserMinus, Shield, ChevronDown, Bell } from 'lucide-react';
import type { FriendWithProfile } from '../types';
import type { SearchResult } from '../hooks/useFriends';
import { cn } from '../lib/utils';

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

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 right-0 h-full w-[360px] bg-[var(--card)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
        <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
          <Users size={22} className="text-[var(--primary)]" /> Amigos
        </h2>
        <div className="flex items-center gap-1">
          {notifPermission === 'default' && (
            <button
              onClick={requestNotificationPermission}
              className="p-2 rounded-xl hover:bg-[var(--accent)] transition-colors text-[var(--muted)]"
              title="Habilitar notificaciones"
              aria-label="Habilitar notificaciones"
            >
              <Bell size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--accent)] transition-colors text-[var(--muted)]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar usuarios..."
            className="w-full pl-10 pr-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm"
          />
        </div>
        {searchError && <p className="text-red-500 text-xs font-medium px-1 mt-2">{searchError}</p>}

        <AnimatePresence>
          {query.trim() && searchResults.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-2 space-y-1"
            >
              {searchResults.map((r) => {
                const rel = liveRelation(r.uid);
                const isPending = pending.get(r.uid) ?? false;
                const canAdd = rel === 'none' && !isPending;
                return (
                  <motion.li
                    key={r.uid}
                    layout
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]"
                  >
                    <img
                      src={r.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.uid}`}
                      alt={r.displayName}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full flex-shrink-0"
                    />
                    <span className="flex-1 text-sm font-medium text-[var(--text)] truncate">{r.displayName}</span>
                    <button
                      disabled={!canAdd}
                      onClick={() => canAdd && handleSendRequest(r.uid)}
                      className={cn(
                        'text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0',
                        canAdd
                          ? 'bg-[var(--primary)] text-white hover:opacity-90'
                          : 'bg-[var(--accent)] text-[var(--muted)] cursor-default'
                      )}
                    >
                      {rel === 'none' ? (
                        isPending
                          ? 'Enviando...'
                          : <span className="flex items-center gap-1"><UserPlus size={12} />Agregar</span>
                      ) : (
                        relationLabel(rel)
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
          {query.trim() && searchResults.length === 0 && !loading && (
            <p className="text-xs text-[var(--muted)] text-center mt-3">No se encontraron usuarios.</p>
          )}
        </AnimatePresence>
      </div>

      {/* Tabs */}
      <div className="flex p-2 gap-1 border-b border-[var(--border)]">
        <button
          onClick={() => setTab('friends')}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5',
            tab === 'friends'
              ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm border border-[var(--border)]'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          )}
        >
          <Users size={15} /> Amigos
          {friends.length > 0 && (
            <span className="text-xs bg-[var(--accent)] text-[var(--muted)] px-1.5 rounded-full">{friends.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('requests')}
          className={cn(
            'flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5',
            tab === 'requests'
              ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm border border-[var(--border)]'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          )}
        >
          <UserPlus size={15} /> Solicitudes
          {received.length > 0 && (
            <span className="text-xs bg-red-500 text-white px-1.5 rounded-full font-bold">{received.length}</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-8">Cargando...</p>
        ) : tab === 'friends' ? (
          <>
            {friends.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Users size={40} className="mx-auto text-[var(--border)]" />
                <p className="text-sm text-[var(--muted)]">Aún no tienes amigos. ¡Busca y agrega a alguien!</p>
              </div>
            ) : (
              <AnimatePresence>
                {friends.map((f) => (
                  <motion.div
                    key={f.otherUid}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-3 p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)]"
                  >
                    <img
                      src={f.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.otherUid}`}
                      alt={f.otherProfile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                    <span className="flex-1 text-sm font-semibold text-[var(--text)] truncate">
                      {f.otherProfile.displayName}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { onStartDM(f); onClose(); }}
                        className="relative p-2 rounded-lg bg-[var(--accent)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all"
                        title="Mensaje"
                      >
                        <MessageSquare size={16} />
                        {(unreadByOther.get(f.otherUid) ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {unreadByOther.get(f.otherUid)}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => block(f)}
                        className="p-2 rounded-lg bg-[var(--accent)] text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-all"
                        title="Bloquear"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </>
        ) : (
          <>
            {received.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-[var(--muted)] px-1">Recibidas</p>
                <AnimatePresence>
                  {received.map((f) => (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)]"
                    >
                      <img
                        src={f.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.otherUid}`}
                        alt={f.otherProfile.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                      <span className="flex-1 text-sm font-semibold text-[var(--text)] truncate">
                        {f.otherProfile.displayName}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => accept(f)}
                          className="p-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-all"
                          title="Aceptar"
                        >
                          <UserCheck size={16} />
                        </button>
                        <button
                          onClick={() => reject(f)}
                          className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                          title="Rechazar"
                        >
                          <UserX size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {sent.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-[var(--muted)] px-1">Enviadas</p>
                <AnimatePresence>
                  {sent.map((f) => (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)]"
                    >
                      <img
                        src={f.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.otherUid}`}
                        alt={f.otherProfile.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                      <span className="flex-1 text-sm font-semibold text-[var(--text)] truncate">
                        {f.otherProfile.displayName}
                      </span>
                      <button
                        onClick={() => cancel(f)}
                        className="p-2 rounded-lg bg-[var(--accent)] text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-all"
                        title="Cancelar solicitud"
                      >
                        <UserX size={16} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {received.length === 0 && sent.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <UserPlus size={40} className="mx-auto text-[var(--border)]" />
                <p className="text-sm text-[var(--muted)]">No hay solicitudes pendientes.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: usuarios bloqueados */}
      {blocked.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--accent)]/40 flex-shrink-0">
          <button
            onClick={() => setShowBlocked((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Shield size={15} />
              Usuarios bloqueados ({blocked.length})
            </span>
            <motion.span
              animate={{ rotate: showBlocked ? 180 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronDown size={16} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showBlocked && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="max-h-48 overflow-y-auto px-4 pb-3 space-y-2">
                  {blocked.map((f) => (
                    <motion.div
                      key={f.otherUid}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-xl border border-[var(--border)]"
                    >
                      <img
                        src={f.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.otherUid}`}
                        alt={f.otherProfile.displayName}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full flex-shrink-0 grayscale"
                      />
                      <span className="flex-1 text-sm font-medium text-[var(--text)] truncate">
                        {f.otherProfile.displayName}
                      </span>
                      <button
                        onClick={async () => {
                          try { await unblock(f); } catch (err) { console.error('Error desbloqueando:', err); }
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all flex-shrink-0"
                      >
                        Desbloquear
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.aside>
  );
}
