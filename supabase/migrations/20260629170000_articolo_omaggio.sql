-- Articolo in omaggio: la riga vale €0 per il cliente ma i costi (materiale/posa)
-- restano tracciati e confluiscono nella commessa.
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS omaggio boolean NOT NULL DEFAULT false;
