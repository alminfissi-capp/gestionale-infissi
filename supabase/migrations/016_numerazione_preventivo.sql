-- Aggiunge campi di configurazione numerazione preventivi alla tabella settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS num_prefisso   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS num_operatore  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS num_contatore  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_anno       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_padding    INTEGER NOT NULL DEFAULT 2;

-- num_prefisso : es. "PRE" — se NULL la numerazione automatica è disabilitata
-- num_operatore: es. "G"   — lettera operatore (facoltativa)
-- num_contatore: ultimo numero progressivo emesso nell'anno corrente
-- num_anno     : anno a cui si riferisce il contatore (se cambia → reset)
-- num_padding  : cifre per il padding del progressivo (es. 2 → "01", "02")
