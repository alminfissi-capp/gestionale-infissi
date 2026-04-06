-- Aggiunge tipo apertura e configurazione per anta alle voci rilievo veloce
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS tipo_apertura TEXT,
  ADD COLUMN IF NOT EXISTS apertura_ante JSONB NOT NULL DEFAULT '[]'::jsonb;
