-- Allegati PDF caricati dal dispositivo (fuori dalla libreria cataloghi),
-- accodati alla stampa del preventivo come i cataloghi.
-- Ogni voce: { id: uuid, nome: text, storage_path: text }
-- File nel bucket pubblico esistente `preventivi-allegati`.

ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS allegati_pdf JSONB NOT NULL DEFAULT '[]'::jsonb;
