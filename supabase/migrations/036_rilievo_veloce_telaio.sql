-- ============================================================
-- 036 — Rilievo Veloce: tipologie telaio per lato
-- ============================================================

-- 1. Aggiunge 'telaio' al CHECK su rilievo_opzioni
ALTER TABLE rilievo_opzioni DROP CONSTRAINT IF EXISTS rilievo_opzioni_tipo_check;
ALTER TABLE rilievo_opzioni ADD CONSTRAINT rilievo_opzioni_tipo_check
  CHECK (tipo IN ('accessorio', 'colore', 'vetro', 'serratura', 'serie', 'struttura', 'telaio'));

-- 2. Quattro colonne (una per lato) sulle voci rilievo
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS telaio_top    TEXT,
  ADD COLUMN IF NOT EXISTS telaio_left   TEXT,
  ADD COLUMN IF NOT EXISTS telaio_bottom TEXT,
  ADD COLUMN IF NOT EXISTS telaio_right  TEXT;
