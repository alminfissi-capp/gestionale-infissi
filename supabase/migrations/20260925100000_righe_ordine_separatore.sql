-- Righe separatore negli ordini fornitore.
--
-- Compilando la distinta si vuole una riga vuota fra una tipologia di
-- materiale e l'altra. Non e' un articolo: non ha quantita', descrizione ne'
-- prezzo, serve solo a spezzare l'elenco.
--
-- `quantita` diventa quindi nullable e il CHECK vale solo per gli articoli:
-- per loro resta obbligatoria e maggiore di zero, come prima.
ALTER TABLE righe_ordine_fornitore
  ADD COLUMN tipo TEXT NOT NULL DEFAULT 'articolo'
    CHECK (tipo IN ('articolo', 'separatore'));

ALTER TABLE righe_ordine_fornitore
  ALTER COLUMN quantita DROP NOT NULL;

ALTER TABLE righe_ordine_fornitore
  DROP CONSTRAINT righe_ordine_fornitore_quantita_check;

ALTER TABLE righe_ordine_fornitore
  ADD CONSTRAINT righe_ordine_fornitore_quantita_check
    CHECK (tipo = 'separatore' OR (quantita IS NOT NULL AND quantita > 0));

COMMENT ON COLUMN righe_ordine_fornitore.tipo IS
  'separatore = riga vuota che spezza l''elenco: niente quantita, descrizione o prezzo.';
