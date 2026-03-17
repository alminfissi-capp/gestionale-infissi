-- Aggiunge flag per mostrare o nascondere lo sconto per riga nel PDF del preventivo
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS mostra_sconto_riga boolean NOT NULL DEFAULT false;
