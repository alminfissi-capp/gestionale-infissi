-- Prezzo acquisto per accessori del catalogo
ALTER TABLE accessori_listino
  ADD COLUMN IF NOT EXISTS prezzo_acquisto NUMERIC NOT NULL DEFAULT 0;

-- Costo posa per articolo (uso interno, non visibile al cliente)
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS costo_posa NUMERIC NOT NULL DEFAULT 0;
