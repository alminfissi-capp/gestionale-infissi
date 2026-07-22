-- ============================================================
-- 20260722190000_righe_ordine_articolo_finitura.sql
-- Righe ordine fornitore: campi Cod. Articolo e Finitura
-- ============================================================

ALTER TABLE righe_ordine_fornitore
  ADD COLUMN IF NOT EXISTS codice_articolo TEXT,
  ADD COLUMN IF NOT EXISTS finitura        TEXT;
