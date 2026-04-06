-- Aggiunge traverse (divisori orizzontali) alle voci rilievo veloce
ALTER TABLE rilievo_veloce_voci
  ADD COLUMN IF NOT EXISTS n_traverse INTEGER;
