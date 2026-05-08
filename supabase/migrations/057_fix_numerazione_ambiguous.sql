-- Fix ambiguità colonna/variabile in increment_num_contatore.
-- RETURNS TABLE(num_contatore, num_anno) creava variabili implicite che
-- collidevano con le colonne settings.num_contatore/num_anno nel CASE,
-- causando "column reference is ambiguous" e il fallimento silenzioso
-- della numerazione automatica dei preventivi.
CREATE OR REPLACE FUNCTION increment_num_contatore(p_org_id UUID)
RETURNS TABLE(num_contatore INT, num_anno INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_contatore INT;
  v_new_anno      INT;
  v_current_year  INT;
BEGIN
  v_current_year := EXTRACT(YEAR FROM NOW())::INT;

  UPDATE settings s
  SET
    num_contatore = CASE
      WHEN s.num_anno IS DISTINCT FROM v_current_year THEN 1
      ELSE COALESCE(s.num_contatore, 0) + 1
    END,
    num_anno = v_current_year
  WHERE s.organization_id = p_org_id
  RETURNING s.num_contatore, s.num_anno
  INTO v_new_contatore, v_new_anno;

  RETURN QUERY SELECT v_new_contatore, v_new_anno;
END;
$$;
