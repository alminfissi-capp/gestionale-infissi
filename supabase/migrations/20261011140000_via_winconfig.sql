-- ============================================================
-- 20261011140000_via_winconfig.sql
-- WinConfig sostituito dal rilievo con le strutture di FP PRO (fase 3).
-- Verificato il 2026-10-11: 0 righe di preventivo di tipo winconfig.
-- Via anche le opzioni in testo libero del vecchio rilievo veloce.
-- ============================================================

DROP TABLE IF EXISTS wc_accessori, wc_colori, wc_profili, wc_riempimenti, wc_serie CASCADE;

ALTER TABLE articoli_preventivo DROP COLUMN IF EXISTS config_winconfig;
ALTER TABLE articoli_preventivo DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;
ALTER TABLE articoli_preventivo ADD CONSTRAINT articoli_preventivo_tipo_check
  CHECK (tipo IN ('listino', 'libera', 'listino_libero', 'scorrevole', 'su_misura'));

DELETE FROM user_permissions WHERE modulo = 'winconfig';
-- (nomi dei vincoli verificati con pg_constraint il 2026-10-11)
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo IN ('dashboard', 'calendario', 'preventivi', 'clienti', 'listini', 'cataloghi', 'rilievo',
                    'magazzino', 'commesse', 'dipendenti', 'produzione', 'fatture_fornitori', 'impostazioni'));

DROP TABLE IF EXISTS rilievo_opzioni CASCADE;
