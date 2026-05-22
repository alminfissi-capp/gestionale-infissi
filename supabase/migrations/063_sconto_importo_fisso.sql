-- Aggiunge colonna per sconto globale in importo fisso (€).
-- Quando valorizzata, sovrascrive il calcolo percentuale (sconto_globale rimane
-- per compatibilità e display, ma i calcoli usano questo valore esatto).
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS sconto_importo_fisso NUMERIC(10,2) DEFAULT NULL;
