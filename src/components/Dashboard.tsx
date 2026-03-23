import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Plus, Phone, LogOut, Settings } from 'lucide-react';
import { Call, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface DashboardProps {
  userProfile: UserProfile;
  onJoinCall: (callId: string) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export default function Dashboard({ userProfile, onJoinCall, onLogout, onOpenSettings }: DashboardProps) {
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [endedCalls, setEndedCalls] = useState<Call[]>([]);
  const [newCallName, setNewCallName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'calls'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const active: Call[] = [];
      const ended: Call[] = [];
      const now = new Date();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Call;
        const call = { id: docSnap.id, ...data };
        
        if (data.status === 'active') {
          // Auto-cleanup logic: if empty for > 5 minutes
          if (data.lastActiveAt) {
            const lastActive = new Date(data.lastActiveAt);
            const diffMins = (now.getTime() - lastActive.getTime()) / (1000 * 60);
            if (diffMins > 5) {
              updateDoc(doc(db, 'calls', docSnap.id), { status: 'ended' });
              ended.push({ ...call, status: 'ended' });
              return;
            }
          }
          active.push(call);
        } else {
          ended.push(call);
        }
      });

      setActiveCalls(active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setEndedCalls(ended.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'calls'));
    return () => unsubscribe();
  }, []);

  const handleCreateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCallName.trim() || !auth.currentUser) return;
    setIsCreating(true);
    try {
      const docRef = await addDoc(collection(db, 'calls'), {
        name: newCallName,
        creatorId: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        status: 'active'
      });
      onJoinCall(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'calls');
    } finally {
      setIsCreating(false);
      setNewCallName('');
    }
  };

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
            <h2 className="text-2xl font-bold text-[var(--text)] tracking-tight">Hola, {userProfile.displayName}</h2>
            <p className="text-sm text-[var(--muted)] font-medium">¿Listo para una comunicación auténtica?</p>
          </div>
        </div>
        <div className="flex gap-3">
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
              <button 
                type="submit" 
                disabled={isCreating}
                className="w-full py-4 bg-[var(--primary)] text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20"
              >
                {isCreating ? 'Iniciando...' : <><Phone size={20} /> Crear Llamada</>}
              </button>
            </form>
          </div>
        </section>

        {/* Active Calls Section */}
        <section className="lg:col-span-2 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Phone size={20} className="text-green-500" /> En Vivo
              </h3>
              <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-full uppercase tracking-widest">
                {activeCalls.length} Activas
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeCalls.length === 0 ? (
                <div className="col-span-full card p-12 text-center space-y-2 bg-[var(--accent)]/30 border-dashed">
                  <p className="text-[var(--muted)] font-medium">No hay comunicaciones activas.</p>
                  <p className="text-xs text-[var(--muted)] opacity-60">Sé el primero en iniciar una.</p>
                </div>
              ) : (
                activeCalls.map((call) => (
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
                endedCalls.slice(0, 5).map((call) => (
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
    </div>
  );
}
