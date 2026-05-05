-- Aggiunge modalità bypass calcolo listino per gli articoli preventivo
ALTER TABLE articoli_preventivo
  ADD COLUMN bypass_calcolo        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN costo_prodotto_bypass NUMERIC(12,2),
  ADD COLUMN modalita_prezzo_bypass TEXT        CHECK (modalita_prezzo_bypass IN ('manuale', 'percentuale')),
  ADD COLUMN percentuale_utile_bypass NUMERIC(5,2);
