-- Le attivita' di una commessa non sono solo "da fare" o "fatte": in officina
-- una lavorazione parte, si ferma, resta bloccata in attesa di materiale.
-- I tasti nel riquadro Attivita' della commessa scrivono qui.
ALTER TABLE eventi_calendario DROP CONSTRAINT IF EXISTS eventi_calendario_stato_valido;
ALTER TABLE eventi_calendario ADD CONSTRAINT eventi_calendario_stato_valido
  CHECK (stato IN ('programmato', 'in_corso', 'bloccato', 'completato', 'annullato'));
