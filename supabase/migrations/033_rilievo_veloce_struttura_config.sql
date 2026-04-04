-- ============================================================
-- 033 — Struttura configurabile + collegamento serie + n. ante
-- ============================================================

-- 1. Aggiunge 'struttura' al tipo check
ALTER TABLE rilievo_opzioni DROP CONSTRAINT IF EXISTS rilievo_opzioni_tipo_check;
ALTER TABLE rilievo_opzioni ADD CONSTRAINT rilievo_opzioni_tipo_check
  CHECK (tipo IN ('accessorio', 'colore', 'vetro', 'serratura', 'serie', 'struttura'));

-- 2. Colonna per collegare una serie alle strutture compatibili
--    (array di UUID delle opzioni struttura)
ALTER TABLE rilievo_opzioni
  ADD COLUMN IF NOT EXISTS strutture_collegate TEXT[] NOT NULL DEFAULT '{}';

-- 3. Numero ante nella voce rilievo
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS n_ante INT;
