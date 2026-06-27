-- Costi manuali per commesse con preventivo manuale (per il grafico costi/utili stimati).
-- Tutte nullable: null = non compilato (vale 0 nel calcolo).
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS costo_materiali_manuale numeric,
  ADD COLUMN IF NOT EXISTS costo_manodopera_manuale numeric,
  ADD COLUMN IF NOT EXISTS utile_manuale numeric;
