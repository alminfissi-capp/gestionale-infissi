-- ============================================================
-- 20261011190000_correzioni_fp_colonna.sql
-- Correzioni del calcolo fatte in ufficio (ore, percentuali, extra) in una colonna propria:
-- il telefono invia la voce intera (fp) con "vince l'ultima modifica" e le cancellerebbe,
-- o le correzioni cancellerebbero una misura appena cambiata in cantiere.
-- correzioni_fp_at serve a capire se il calcolo salvato e' superato.
-- ============================================================

ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS correzioni_fp jsonb;
ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS correzioni_fp_at timestamptz;
