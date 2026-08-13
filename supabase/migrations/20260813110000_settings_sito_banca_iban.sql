-- Dati aziendali usati dal resoconto economico di commessa:
-- sito nell'intestazione, banca e IBAN nel piede del documento.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS sito_web text,
  ADD COLUMN IF NOT EXISTS banca    text,
  ADD COLUMN IF NOT EXISTS iban     text;
