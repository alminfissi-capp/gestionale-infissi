-- ============================================================
-- 20260729100000_tracking_pdf_path.sql
-- Collega ogni evento di invio alla copia congelata del PDF
-- ============================================================

ALTER TABLE tracking_email_ordine
  ADD COLUMN IF NOT EXISTS pdf_path TEXT;

COMMENT ON COLUMN tracking_email_ordine.pdf_path IS
  'Storage path della copia congelata inviata in quell''occasione. Valorizzato solo sugli eventi tipo=inviato: consente di risalire al documento esatto di ogni invio, anche dopo un reinvio.';
