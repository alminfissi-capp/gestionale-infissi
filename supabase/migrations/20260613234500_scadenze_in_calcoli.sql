-- Stella "Calcoli" sulle scadenze (come per le commesse)
ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS in_calcoli boolean NOT NULL DEFAULT false;
