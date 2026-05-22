ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS token_conferma text UNIQUE,
  ADD COLUMN IF NOT EXISTS firma_documento_id text,
  ADD COLUMN IF NOT EXISTS firma_stato text CHECK (firma_stato IN ('in_attesa', 'firmato', 'rifiutato', 'scaduto')),
  ADD COLUMN IF NOT EXISTS firma_richiesta_at timestamptz,
  ADD COLUMN IF NOT EXISTS firma_completata_at timestamptz,
  ADD COLUMN IF NOT EXISTS firma_pdf_path text;

CREATE INDEX IF NOT EXISTS idx_preventivi_token_conferma
  ON preventivi(token_conferma)
  WHERE token_conferma IS NOT NULL;
