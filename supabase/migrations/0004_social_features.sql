-- 1. Habilitar CDC de friendships para que solicitudes y aceptaciones
-- se propaguen en tiempo real sin polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- 2. Trigger para mantener dm_threads.last_message_at sincronizado.
CREATE OR REPLACE FUNCTION public.touch_dm_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dm_threads
  SET last_message_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dm_messages_touch_thread ON public.dm_messages;
CREATE TRIGGER dm_messages_touch_thread
AFTER INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_dm_thread();

-- 3. El trigger hace el UPDATE con SECURITY DEFINER, no se necesita
-- política RLS de UPDATE sobre dm_threads para clientes.
DROP POLICY IF EXISTS "dm_threads update" ON public.dm_threads;
