-- ============================================================
-- 032 — Rilievo Veloce: struttura e anta principale
-- ============================================================

ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS struttura      TEXT,
  ADD COLUMN IF NOT EXISTS anta_principale INT;
