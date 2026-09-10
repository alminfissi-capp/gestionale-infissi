-- ============================================================
-- 20260910100000_errore_invio_ordine.sql
-- Esito dell'ultimo tentativo di invio ordine al fornitore.
-- Serve a tenere visibile "invio fallito" (es. email mancante) finche'
-- un nuovo tentativo non riesce: un toast sparisce, questo no.
-- ============================================================

ALTER TABLE ordini_fornitore
  ADD COLUMN IF NOT EXISTS errore_invio text,
  ADD COLUMN IF NOT EXISTS errore_invio_at timestamptz;

COMMENT ON COLUMN ordini_fornitore.errore_invio IS
  'Motivo dell''ultimo invio fallito; azzerato appena un invio va a buon fine.';
