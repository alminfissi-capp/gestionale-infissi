-- ============================================================
-- 031 — Rilievo Veloce: aggiunta "serie profili"
-- ============================================================

-- 1. Aggiunge la colonna serie_profilo alle voci
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS serie_profilo TEXT;

-- 2. Aggiorna il CHECK su rilievo_opzioni per includere 'serie'
ALTER TABLE rilievo_opzioni
  DROP CONSTRAINT IF EXISTS rilievo_opzioni_tipo_check;

ALTER TABLE rilievo_opzioni
  ADD CONSTRAINT rilievo_opzioni_tipo_check
  CHECK (tipo IN ('accessorio', 'colore', 'vetro', 'serratura', 'serie'));
