-- Provvigione (agente) sul preventivo: spalmata su voci e trasporto, invisibile al cliente.
-- provvigione_percentuale   = percentuale effettiva (se scritta in euro, quella equivalente)
-- provvigione_importo_fisso = importo esatto in euro, se scritta in euro (come sconto_importo_fisso)
-- provvigione_importo       = quanto spetta all'agente dopo lo sconto (per report e statistiche)
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS provvigione_percentuale numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provvigione_importo_fisso numeric,
  ADD COLUMN IF NOT EXISTS provvigione_importo numeric NOT NULL DEFAULT 0;
