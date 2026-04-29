-- Aggiunge colonna per tracciare il canale di visualizzazione del preventivo
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS visualizzato_via text
  CHECK (visualizzato_via IN ('email', 'whatsapp', 'link'));
