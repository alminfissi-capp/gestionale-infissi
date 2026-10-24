-- ============================================================
-- 20261024120000_percentuali_rilievo_fp.sql
-- Percentuali comuni del calcolo di un rilievo (spese generali, utile, provvigione, imballo,
-- viaggio, materiali vari, altro) come frazioni (0.1 = 10%). Valgono per tutte le voci:
-- salvandole si tolgono le percentuali scritte nelle singole voci (correzioni_fp).
-- Chiave assente = valore del profilo di calcolo di FP PRO.
-- ============================================================

ALTER TABLE rilievi_veloci ADD COLUMN IF NOT EXISTS percentuali_fp jsonb;
