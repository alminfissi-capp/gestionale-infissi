-- ============================================================
-- 022_preventivo_cataloghi_multipli.sql
-- Sostituisce il singolo catalogo_allegato_id con un array
-- per supportare allegati multipli
-- ============================================================

ALTER TABLE preventivi
  DROP COLUMN IF EXISTS catalogo_allegato_id;

ALTER TABLE preventivi
  ADD COLUMN cataloghi_allegati UUID[] NOT NULL DEFAULT '{}';
