-- ============================================================
-- 034 — Rilievo Veloce: aggiunta colonna h_davanzale_mm
-- ============================================================

ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS h_davanzale_mm INT;
