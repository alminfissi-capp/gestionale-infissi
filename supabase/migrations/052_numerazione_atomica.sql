-- Funzione RPC per incremento atomico del contatore preventivo.
-- Evita race condition quando due utenti creano un preventivo in contemporanea:
-- legge, incrementa e restituisce il contatore in una singola transazione.
CREATE OR REPLACE FUNCTION increment_num_contatore(p_org_id UUID)
RETURNS TABLE(num_contatore INT, num_anno INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_anno INT;
  v_current_year INT;
  v_new_contatore INT;
  v_new_anno INT;
BEGIN
  v_current_year := EXTRACT(YEAR FROM NOW())::INT;

  UPDATE settings
  SET
    num_contatore = CASE
      WHEN num_anno IS DISTINCT FROM v_current_year THEN 1
      ELSE COALESCE(settings.num_contatore, 0) + 1
    END,
    num_anno = v_current_year
  WHERE organization_id = p_org_id
  RETURNING settings.num_contatore, settings.num_anno
  INTO v_new_contatore, v_new_anno;

  RETURN QUERY SELECT v_new_contatore, v_new_anno;
END;
$$;
