-- Aggiunge il tipo 'scorrevole' agli articoli preventivo
-- e la colonna JSONB per salvare la configurazione completa

-- Drop del vecchio constraint e aggiunta del nuovo con 'scorrevole'
ALTER TABLE articoli_preventivo
  DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;

ALTER TABLE articoli_preventivo
  ADD CONSTRAINT articoli_preventivo_tipo_check
  CHECK (tipo IN ('listino', 'libera', 'listino_libero', 'scorrevole'));

-- Colonna per la configurazione scorrevole (riga completa + parametri commerciali)
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS config_scorrevole JSONB DEFAULT NULL;
