-- 042: rilievo veloce — forma trapezoidale + albero vani configurabile
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS fuori_squadro  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS altezza_sx_mm  INTEGER,
  ADD COLUMN IF NOT EXISTS altezza_dx_mm  INTEGER,
  ADD COLUMN IF NOT EXISTS vani_tree      JSONB;
