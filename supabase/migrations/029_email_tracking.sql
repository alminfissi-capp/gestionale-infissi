-- Aggiunge colonna per il tracking di apertura email
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS email_aperta_at timestamptz;
