import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Send } from 'lucide-react';
import { useDMThread } from '../hooks/useDMThread';
import { useDialogo } from '../hooks/useDialogo';
import type { FriendWithProfile } from '../types';
import { cn } from '../lib/utils';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import Medidor from './ui/Medidor';
import MensajeError from './ui/MensajeError';

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
  const ventanaRef = useRef<HTMLDivElement>(null);

  // Diálogo no modal: foco al campo, Escape cierra y el foco vuelve al activador
  useDialogo({ ref: ventanaRef, abierto: true, onCerrar: onClose, modal: false, focoInicial: textareaRef });

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
      ref={ventanaRef}
      role="dialog"
      aria-label={`Mensajes con ${friend.otherProfile.displayName}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'tween', duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed bottom-0 right-0 z-50 flex h-[85dvh] w-full flex-col rounded-t-contenedor border border-b-0 border-separador bg-superficie md:right-6 md:h-[520px] md:w-[380px]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-separador px-4 py-3">
        <img
          src={friend.otherProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.otherUid}`}
          alt={friend.otherProfile.displayName}
          referrerPolicy="no-referrer"
          className="h-10 w-10 flex-shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{friend.otherProfile.displayName}</span>
        <Boton variante="plano" onClick={onClose} aria-label="Cerrar">
          <X size={20} aria-hidden="true" />
        </Boton>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        className="scrollbar-thin flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4"
      >
        {loading ? (
          <p className="py-4 text-center text-texto-secundario">Cargando...</p>
        ) : error ? (
          <MensajeError>No se pudo abrir el chat.</MensajeError>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Medidor segmentos={0} />
            <p className="text-texto-secundario">Di hola a {friend.otherProfile.displayName}!</p>
          </div>
        ) : (
          // Reversed so flex-col-reverse shows latest at bottom
          [...messages].reverse().map((msg) => {
            const isMe = msg.sender_id === myUid;
            return (
              <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] break-words rounded-contenedor px-3.5 py-2 text-texto',
                    isMe ? 'rounded-br-[6px] bg-accion-suave' : 'rounded-bl-[6px] bg-fondo-alterno'
                  )}
                >
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                  <p className={cn('mt-1 text-xs tabular-nums text-texto-secundario', isMe && 'text-right')}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-separador p-3">
        <Campo
          multilinea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Mensaje"
          placeholder="Escribe un mensaje..."
          rows={1}
          fondo
          claseContenedor="min-w-0 flex-1"
          className="overflow-hidden"
          style={{ maxHeight: '96px' }}
        />
        <Boton onClick={handleSend} disabled={!canSend} tamano="cuadrado" aria-label="Enviar" className="flex-none">
          <Send size={20} aria-hidden="true" />
        </Boton>
      </div>
    </motion.div>
  );
}
