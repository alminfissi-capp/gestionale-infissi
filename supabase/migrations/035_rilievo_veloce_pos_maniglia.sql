-- ============================================================
-- 035 — Rilievo Veloce: posizione maniglia anta principale
-- ============================================================

ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS pos_maniglia TEXT
    CHECK (pos_maniglia IN ('right', 'left', 'top', 'bottom'));
