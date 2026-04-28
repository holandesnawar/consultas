-- Permitir al alumno editar/borrar SU consulta sin auth completa.
-- Patrón: cada consulta tiene un edit_token (uuid). El cliente lo guarda en sessionStorage
-- al crearla y lo pasa como argumento a las RPCs. Las RPCs son SECURITY DEFINER y validan
-- el token internamente — bypasean RLS de UPDATE/DELETE.

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS edit_token uuid DEFAULT gen_random_uuid();

UPDATE consultas SET edit_token = gen_random_uuid() WHERE edit_token IS NULL;

-- RPC para editar consulta (solo si no está resuelta y el token coincide)
CREATE OR REPLACE FUNCTION update_my_consulta(
  consulta_id    uuid,
  consulta_token uuid,
  new_title      text,
  new_content    text,
  new_category   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected uuid;
BEGIN
  UPDATE consultas
  SET title    = new_title,
      content  = new_content,
      category = new_category
  WHERE id = consulta_id
    AND edit_token = consulta_token
    AND resolved = false
  RETURNING id INTO affected;

  IF affected IS NULL THEN
    RAISE EXCEPTION 'Token inválido, consulta no encontrada o ya resuelta';
  END IF;
  RETURN affected;
END;
$$;

-- RPC para borrar consulta (no permitido si ya está resuelta)
CREATE OR REPLACE FUNCTION delete_my_consulta(
  consulta_id    uuid,
  consulta_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM consultas
  WHERE id = consulta_id
    AND edit_token = consulta_token
    AND resolved = false;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'Token inválido, consulta no encontrada o ya resuelta';
  END IF;
  RETURN true;
END;
$$;
