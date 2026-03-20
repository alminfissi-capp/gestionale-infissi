-- ============================================================
-- 028_giorni_validita_preventivo.sql
-- Aggiunge la configurazione dei giorni di validità di un preventivo.
-- Dopo questo numero di giorni dall'invio, il preventivo passa a "scaduto".
-- Default: 30 giorni
-- ============================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS giorni_validita_preventivo INTEGER NOT NULL DEFAULT 30;
