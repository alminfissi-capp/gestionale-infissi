-- Aggiunge 'viteria' ai tipi di categoria magazzino
ALTER TABLE categorie_magazzino
  DROP CONSTRAINT IF EXISTS categorie_magazzino_tipo_check;

ALTER TABLE categorie_magazzino
  ADD CONSTRAINT categorie_magazzino_tipo_check
  CHECK (tipo = ANY (ARRAY['alluminio','ferro','accessori','pannelli','chimici','viteria']));
