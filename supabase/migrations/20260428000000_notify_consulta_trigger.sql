-- Trigger que invoca la Edge Function `notify-consulta-respondida`
-- cuando respuesta_nawar pasa de NULL a un valor (o cambia).
-- Usa pg_net (incluida en Supabase) para hacer una HTTP call asíncrona.
-- La Edge Function se deploya con --no-verify-jwt para evitar pasar service_role_key.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_consulta_respondida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url text := 'https://alifjhqjmedstkafnrmp.supabase.co/functions/v1/notify-consulta-respondida';
BEGIN
  IF NEW.respuesta_nawar IS NOT NULL
     AND (OLD.respuesta_nawar IS NULL
          OR OLD.respuesta_nawar IS DISTINCT FROM NEW.respuesta_nawar) THEN

    PERFORM net.http_post(
      url := function_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'consultas',
        'record', to_jsonb(NEW),
        'old_record', to_jsonb(OLD)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consulta_respondida ON public.consultas;

CREATE TRIGGER trg_consulta_respondida
AFTER UPDATE ON public.consultas
FOR EACH ROW
EXECUTE FUNCTION public.notify_consulta_respondida();
