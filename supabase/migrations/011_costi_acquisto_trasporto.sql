-- Modalità visualizzazione trasporto nel preventivo
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS modalita_trasporto TEXT NOT NULL DEFAULT 'separato',
  ADD COLUMN IF NOT EXISTS totale_costi_acquisto NUMERIC NOT NULL DEFAULT 0;

-- Costo acquisto unitario per ogni articolo (calcolato server-side al salvataggio)
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS costo_acquisto_unitario NUMERIC NOT NULL DEFAULT 0;

-- Prezzo di acquisto per prodotti del catalogo (listino libero)
ALTER TABLE prodotti_listino
  ADD COLUMN IF NOT EXISTS prezzo_acquisto NUMERIC NOT NULL DEFAULT 0;
