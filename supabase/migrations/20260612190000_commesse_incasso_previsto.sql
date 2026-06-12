-- Incasso previsto inserito a mano dall'operatore nello slot Calcoli
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS incasso_previsto numeric;
