ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS aliquota_iva NUMERIC;           -- null = nessuna IVA

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS aliquote_iva JSONB NOT NULL DEFAULT '[22, 10, 4]'::jsonb;

ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS iva_totale    NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS riepilogo_iva JSONB   NOT NULL DEFAULT '[]'::jsonb;
