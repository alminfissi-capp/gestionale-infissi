-- Cronometro delle attività: il tasto play avvia, gli altri tre fermano.
-- `avviato_at` valorizzato significa "sta correndo adesso"; `secondi_lavorati`
-- e' il tempo gia' accumulato nelle sessioni chiuse.
ALTER TABLE eventi_calendario
  ADD COLUMN IF NOT EXISTS avviato_at       timestamptz,
  ADD COLUMN IF NOT EXISTS secondi_lavorati integer NOT NULL DEFAULT 0;

-- Il conto del tempo lo fa il database con il proprio orologio: due tablet in
-- officina con l'ora sfasata non devono scrivere durate diverse. Chiude la
-- sessione in corso (se c'e') e riapre solo quando si torna in corso.
CREATE OR REPLACE FUNCTION set_stato_attivita(p_id uuid, p_stato text)
RETURNS TABLE (stato text, avviato_at timestamptz, secondi_lavorati integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_stato NOT IN ('programmato', 'in_corso', 'bloccato', 'completato') THEN
    RAISE EXCEPTION 'Stato attivita non valido: %', p_stato;
  END IF;

  RETURN QUERY
  UPDATE eventi_calendario e
  SET
    secondi_lavorati = e.secondi_lavorati + CASE
      WHEN e.avviato_at IS NULL THEN 0
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - e.avviato_at))::integer)
    END,
    avviato_at = CASE WHEN p_stato = 'in_corso' THEN now() ELSE NULL END,
    stato = p_stato,
    updated_at = now()
  WHERE e.id = p_id
  RETURNING e.stato, e.avviato_at, e.secondi_lavorati;
END;
$$;
