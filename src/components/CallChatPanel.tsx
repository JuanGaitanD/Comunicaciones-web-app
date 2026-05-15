import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Send, MessageSquare } from 'lucide-react';
import type { CallMessage } from '../types';

interface CallChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: CallMessage[];
  loading: boolean;
  send: (body: string) => Promise<void>;
  myUid: string;
  participantsMap: Map<string, { displayName: string; photoURL: string }>;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CallChatPanel({
  open,
  onClose,
  messages,
  loading,
  send,
  myUid,
  participantsMap,
}: CallChatPanelProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [body]);

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setBody('');
    try {
      await send(trimmed);
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      // Restaurar el cuerpo si falla, para que el usuario no pierda el texto.
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  }, [body, sending, send]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = body.trim().length > 0 && body.trim().length <= 4000 && !sending;

  // Render mensajes en orden cronológico inverso porque la lista usa flex-col-reverse.
  const renderList = [...messages].reverse();

  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 right-0 h-full w-[360px] bg-[var(--card)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col"
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
        <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
          <MessageSquare size={22} className="text-[var(--primary)]" /> Chat
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-[var(--accent)] transition-colors text-[var(--muted)]"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 flex flex-col-reverse overflow-y-auto p-4 gap-2 scrollbar-thin">
        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-8">Cargando mensajes...</p>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <MessageSquare size={40} className="mx-auto text-[var(--border)]" />
            <p className="text-sm text-[var(--muted)]">Sé el primero en escribir.</p>
          </div>
        ) : (
          renderList.map((msg) => {
            const isMine = msg.sender_id === myUid;
            const sender = participantsMap.get(msg.sender_id);
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                {!isMine && sender && (
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <img
                      src={sender.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender_id}`}
                      alt={sender.displayName}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="text-[11px] font-semibold text-[var(--muted)]">
                      {sender.displayName}
                    </span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    isMine
                      ? 'bg-[var(--primary)] text-white rounded-2xl rounded-br-md'
                      : 'bg-[var(--accent)] text-[var(--text)] rounded-2xl rounded-bl-md'
                  }`}
                >
                  {msg.body}
                </div>
                <span className="text-[10px] text-[var(--muted)] mt-1 px-1">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-[var(--primary)] outline-none transition-all text-sm leading-snug scrollbar-thin"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="p-3 rounded-xl bg-[var(--primary)] text-white hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Enviar"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
