-- Aggiunge il campo operatore (iniziale) al profilo di ogni utente.
-- Usato per personalizzare il campo 4 del numero preventivo per utente.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS operatore TEXT DEFAULT NULL;
