ALTER TABLE acconti_commessa ADD COLUMN IF NOT EXISTS firma_immagine TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS firma_default TEXT;
