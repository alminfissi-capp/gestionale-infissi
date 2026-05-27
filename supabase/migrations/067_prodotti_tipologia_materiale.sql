-- Migration 067: aggiungi colonne tipologia, materiale, origine a anagrafica_prodotti
-- tipologia: tipo di prodotto (cerniere, maniglie, chiusure, cilindri, guarnizioni, squadrette, scorrevoli, profilati, tapparelle, viteria, accessori)
-- materiale: materiale (alluminio, ferro, acciaio, acciaio_zincato, inox, ottone, nylon, vari)
-- origine: 'manuale' per prodotti inseriti dall'utente, 'esp' per articoli importati dal catalogo ESP Edilsider

ALTER TABLE anagrafica_prodotti
  ADD COLUMN IF NOT EXISTS tipologia TEXT,
  ADD COLUMN IF NOT EXISTS materiale TEXT,
  ADD COLUMN IF NOT EXISTS origine TEXT NOT NULL DEFAULT 'manuale';

-- Indici per performance su filtri comuni
CREATE INDEX IF NOT EXISTS idx_anagrafica_prodotti_org_tipologia
  ON anagrafica_prodotti (organization_id, tipologia);

CREATE INDEX IF NOT EXISTS idx_anagrafica_prodotti_org_materiale
  ON anagrafica_prodotti (organization_id, materiale);

CREATE INDEX IF NOT EXISTS idx_anagrafica_prodotti_org_origine
  ON anagrafica_prodotti (organization_id, origine);
