import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useDMThread } from '../hooks/useDMThread';
import type { FriendWithProfile } from '../types';

interface DMWindowProps {
  myUid: string;
  friend: FriendWithProfile;
  onClose: () => void;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DMWindow({ myUid, friend, onClose }: DMWindowProps) {
  const { thread, messages, loading, sending, error, sendMessage } = useDMThread(myUid, friend.otherUid);
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [body]);

  const handleSend = useCallback(async () => {
    if (!body.trim() || sending) return;
    const text = body;
    setBody('');
    await sendMessage(text);
  }, [body, sending, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = body.trim().length > 0 && body.trim().length <= 4000 && !sending && !!thread;

  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed bottom-0 right-6 w-[380px] h-[520px] bg-[var(--card)] border border-[var(--border)] rounded-t-2xl shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
        <img
          src={friend.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.otherUid}`}
          alt={friend.otherProfile.displayName}
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-full flex-shrink-0"
        />
        <span className="flex-1 font-semibold text-[var(--text)] truncate">{friend.otherProfile.displayName}</span>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-[var(--accent)] transition-colors text-[var(--muted)]"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-1"
      >
        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-4">Cargando...</p>
        ) : error ? (
          <p className="text-sm text-red-500 text-center py-4">No se pudo abrir el chat.</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-4">Di hola a {friend.otherProfile.displayName}!</p>
        ) : (
          // Reversed so flex-col-reverse shows latest at bottom
          [...messages].reverse().map((msg) => {
            const isMe = msg.sender_id === myUid;
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words ${
                    isMe
                      ? 'bg-[var(--primary)] text-white rounded-br-sm'
                      : 'bg-[var(--accent)] text-[var(--text)] rounded-bl-sm'
                  }`}
                >
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-white/60 text-right' : 'text-[var(--muted)]'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)] flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
          className="flex-1 resize-none bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all overflow-hidden"
          style={{ maxHeight: '96px' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="p-2.5 bg-[var(--primary)] text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          aria-label="Enviar"
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}
