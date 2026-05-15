import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Phone, LogOut, Settings, Users, Globe, Lock, Link as LinkIcon, Check } from 'lucide-react';
import { Call, UserProfile, FriendWithProfile } from '../types';
import type { useFriends } from '../hooks/useFriends';
import FriendsPanel from './FriendsPanel';
import { cn } from '../lib/utils';

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
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedCallId, setCopiedCallId] = useState<string | null>(null);

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
      setCopiedCallId(call.id);
      setTimeout(() => setCopiedCallId((cur) => (cur === call.id ? null : cur)), 1500);
    } catch (err) {
      console.error('No se pudo copiar el link:', err);
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
    setNewCallName('');
    if (error || !data) {
      console.error('Error creando llamada:', error);
      return;
    }
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

  return (
    <div className="min-h-screen p-6 bg-[var(--bg)] font-sans">
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-12">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-[var(--primary)] opacity-20 blur-xl rounded-full" />
            <img
              src={userProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`}
              alt={userProfile.displayName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full border-2 border-[var(--primary)] relative z-10 shadow-lg"
            />
          </div>
          <div>
            {/* KallIt brand — dashboard header */}
            <div className="brand-kallit text-2xl leading-none mb-1">
              <span className="text-[var(--text)]">Kall</span><span className="brand-it text-[var(--primary)]">It</span>
            </div>
            <h2 className="text-sm text-[var(--text)] font-semibold">Hola, {userProfile.displayName}</h2>
            <p className="text-xs text-[var(--muted)] font-medium">¿Listo para una comunicación auténtica?</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setFriendsOpen(true)}
            className="relative p-3 bg-[var(--accent)] text-[var(--text)] rounded-xl hover:bg-[var(--border)] transition-all shadow-sm"
            aria-label="Amigos"
          >
            <Users size={22} />
            {received.length + totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {received.length + totalUnread}
              </span>
            )}
          </button>
          <button onClick={onOpenSettings} className="p-3 bg-[var(--accent)] text-[var(--text)] rounded-xl hover:bg-[var(--border)] transition-all shadow-sm" aria-label="Ajustes"><Settings size={22} /></button>
          <button onClick={onLogout} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all shadow-sm" aria-label="Cerrar sesión"><LogOut size={22} /></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* New Call Section */}
        <section className="lg:col-span-1 space-y-6">
          <div className="card p-8 space-y-6 shadow-xl border-t-4 border-t-[var(--primary)]">
            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus size={24} className="text-[var(--primary)]" /> Iniciar
              </h3>
              <p className="text-xs text-[var(--muted)] font-bold uppercase tracking-widest">Nueva Comunicación</p>
            </div>
            <form onSubmit={handleCreateCall} className="space-y-4">
              <input
                type="text"
                placeholder="Nombre de la sala..."
                value={newCallName}
                onChange={(e) => setNewCallName(e.target.value)}
                className="w-full p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all font-medium"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewCallVisibility('public')}
                  className={cn(
                    'py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border transition-all',
                    newCallVisibility === 'public'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                      : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'
                  )}
                >
                  <Globe size={15} /> Pública
                </button>
                <button
                  type="button"
                  onClick={() => setNewCallVisibility('private')}
                  className={cn(
                    'py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border transition-all',
                    newCallVisibility === 'private'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                      : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'
                  )}
                >
                  <Lock size={15} /> Privada
                </button>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed px-1">
                {newCallVisibility === 'public'
                  ? 'Cualquier persona puede unirse.'
                  : 'Solo amigos la verán listada. Recibirás un link para invitar a no-amigos.'}
              </p>
              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-4 bg-[var(--primary)] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20"
              >
                {isCreating ? 'Iniciando...' : <><Phone size={20} /> Crear Llamada</>}
              </button>
            </form>
            <AnimatePresence>
              {inviteError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2"
                  onClick={() => setInviteError(null)}
                >
                  {inviteError}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Active Calls Section */}
        <section className="lg:col-span-2 space-y-8">
          {/* Privadas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Lock size={18} className="text-[var(--primary)]" /> Privadas (amigos)
              </h3>
              {privateCalls.length > 0 && (
                <span className="text-xs font-bold text-[var(--primary)] bg-[var(--accent)] px-2 py-1 rounded-full uppercase tracking-widest">
                  {privateCalls.length}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {privateCalls.length === 0 ? (
                <div className="col-span-full card p-8 text-center space-y-1 bg-[var(--accent)]/20 border-dashed">
                  <p className="text-[var(--muted)] text-sm font-medium">Sin llamadas privadas activas.</p>
                  <p className="text-xs text-[var(--muted)] opacity-60">Crea una privada para coordinarte con tus amigos.</p>
                </div>
              ) : (
                privateCalls.map((call) => {
                  const isMine = call.creatorId === userProfile.uid;
                  const justCopied = copiedCallId === call.id;
                  return (
                    <motion.div
                      key={call.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4 }}
                      className="card p-5 flex items-center justify-between hover:border-[var(--primary)] transition-all cursor-pointer group shadow-sm hover:shadow-md"
                      onClick={() => onJoinCall(call.id)}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">{call.name}</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] bg-[var(--accent)] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            <Lock size={9} /> Privada
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--muted)]">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-xs font-medium">Activa ahora</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isMine && call.inviteCode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); copyInvite(call); }}
                            className="p-2.5 rounded-xl bg-[var(--accent)] text-[var(--muted)] hover:text-[var(--primary)] transition-all"
                            title={justCopied ? '¡Copiado!' : 'Copiar invite link'}
                            aria-label="Copiar invite link"
                          >
                            {justCopied ? <Check size={16} /> : <LinkIcon size={16} />}
                          </button>
                        )}
                        <div className="p-3 bg-[var(--accent)] text-[var(--primary)] rounded-xl group-hover:bg-[var(--primary)] group-hover:text-white transition-all">
                          <Phone size={20} />
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* Públicas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Globe size={18} className="text-green-500" /> Públicas
              </h3>
              {publicCalls.length > 0 && (
                <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-full uppercase tracking-widest">
                  {publicCalls.length}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publicCalls.length === 0 ? (
                <div className="col-span-full card p-8 text-center space-y-1 bg-[var(--accent)]/20 border-dashed">
                  <p className="text-[var(--muted)] text-sm font-medium">No hay comunicaciones públicas activas.</p>
                  <p className="text-xs text-[var(--muted)] opacity-60">Sé el primero en iniciar una.</p>
                </div>
              ) : (
                publicCalls.map((call) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -4 }}
                    className="card p-5 flex items-center justify-between hover:border-[var(--primary)] transition-all cursor-pointer group shadow-sm hover:shadow-md"
                    onClick={() => onJoinCall(call.id)}
                  >
                    <div className="space-y-1">
                      <h4 className="font-bold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">{call.name}</h4>
                      <div className="flex items-center gap-2 text-[var(--muted)]">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium">Activa ahora</span>
                      </div>
                    </div>
                    <div className="p-3 bg-[var(--accent)] text-[var(--primary)] rounded-xl group-hover:bg-[var(--primary)] group-hover:text-white transition-all">
                      <Phone size={20} />
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* History Section */}
          <div className="space-y-4 pt-4 border-t border-[var(--border)]">
            <div className="px-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Historial Reciente</h3>
            </div>
            <div className="space-y-3">
              {endedCalls.length === 0 ? (
                <p className="text-[var(--muted)] text-xs font-medium px-2">El historial aparecerá aquí.</p>
              ) : (
                endedCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-4 bg-[var(--accent)]/20 rounded-xl border border-transparent hover:border-[var(--border)] transition-all grayscale opacity-60 hover:grayscale-0 hover:opacity-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Phone size={16} className="text-gray-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text)]">{call.name}</h4>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)]">Finalizada • {new Date(call.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
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

      {friendsOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setFriendsOpen(false)}
        />
      )}
    </div>
  );
}
