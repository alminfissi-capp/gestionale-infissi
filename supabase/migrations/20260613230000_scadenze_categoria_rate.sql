-- Categoria scadenza (finanziamento / assegno / altro) + campi rate per i finanziamenti
ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'altro';
ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS numero_rata int;
ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS totale_rate int;
