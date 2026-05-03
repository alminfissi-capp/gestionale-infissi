-- Aggiunge 'kit' come unità di misura nel magazzino
ALTER TABLE anagrafica_prodotti
  DROP CONSTRAINT IF EXISTS anagrafica_prodotti_unita_misura_check;

ALTER TABLE anagrafica_prodotti
  ADD CONSTRAINT anagrafica_prodotti_unita_misura_check
  CHECK (unita_misura = ANY (ARRAY['pz','ml','cop','kg','pacco','lt','m2','barre','kit']));
