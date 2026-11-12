import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Send, MessageSquare } from 'lucide-react';
import type { CallMessage } from '../types';
import { cn } from '../lib/utils';
import { useDialogo } from '../hooks/useDialogo';
import Boton from './ui/Boton';
import Campo from './ui/Campo';
import Medidor from './ui/Medidor';

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
  const panelRef = useRef<HTMLElement>(null);

  // Diálogo no modal: foco al campo al abrir, Escape cierra y el foco vuelve al botón Chat
  useDialogo({ ref: panelRef, abierto: open, onCerrar: onClose, modal: false, focoInicial: textareaRef });

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
      ref={panelRef}
      role="dialog"
      aria-labelledby="titulo-chat"
      inert={!open}
      initial={false}
      animate={{ x: open ? 0 : '100%' }}
      transition={{ type: 'tween', duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className="panel-lateral fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-separador bg-superficie md:w-[400px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-separador px-4 py-3">
        <h2 id="titulo-chat" className="flex items-center gap-2 text-xl font-semibold">
          <MessageSquare size={20} className="text-texto-secundario" aria-hidden="true" /> Chat
        </h2>
        <Boton variante="plano" onClick={onClose} aria-label="Cerrar">
          <X size={20} aria-hidden="true" />
        </Boton>
      </div>

      {/* Lista */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        className="scrollbar-thin flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4"
      >
        {loading ? (
          <p className="py-8 text-center text-texto-secundario">Cargando mensajes...</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Medidor segmentos={0} />
            <p className="text-texto-secundario">Sé el primero en escribir.</p>
          </div>
        ) : (
          renderList.map((msg) => {
            const isMine = msg.sender_id === myUid;
            const sender = participantsMap.get(msg.sender_id);
            return (
              <div key={msg.id} className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                {!isMine && sender && (
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <img
                      src={sender.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender_id}`}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-6 w-6 rounded-full"
                    />
                    <span className="text-sm font-semibold text-texto-secundario">{sender.displayName}</span>
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap break-words rounded-contenedor px-3.5 py-2 text-texto',
                    isMine ? 'rounded-br-[6px] bg-accion-suave' : 'rounded-bl-[6px] bg-fondo-alterno'
                  )}
                >
                  {msg.body}
                </div>
                <span className="mt-1 px-1 text-xs tabular-nums text-texto-secundario">{formatTime(msg.created_at)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-separador p-4">
        <div className="flex items-end gap-2">
          <Campo
            multilinea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Mensaje"
            placeholder="Escribe un mensaje..."
            rows={1}
            maxLength={4000}
            fondo
            claseContenedor="min-w-0 flex-1"
            className="scrollbar-thin"
            style={{ maxHeight: '96px' }}
          />
          <Boton onClick={handleSend} disabled={!canSend} tamano="cuadrado" aria-label="Enviar" className="flex-none">
            <Send size={20} aria-hidden="true" />
          </Boton>
        </div>
      </div>
    </motion.aside>
  );
}
