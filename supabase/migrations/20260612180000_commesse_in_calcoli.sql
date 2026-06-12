-- Flag "Calcoli": commesse selezionate per il calcolo incassi di fine mese
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS in_calcoli boolean NOT NULL DEFAULT false;
