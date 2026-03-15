-- ============================================================
-- 021_preventivo_catalogo_allegato.sql
-- Aggiunge la possibilità di allegare un catalogo/brochure PDF
-- a un preventivo (comparirà nell'ultima pagina della stampa)
-- ============================================================

ALTER TABLE preventivi
  ADD COLUMN catalogo_allegato_id UUID REFERENCES cataloghi(id) ON DELETE SET NULL;
