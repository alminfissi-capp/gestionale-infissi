-- Commessa inesigibile: consegnata, ma il saldo non verra' mai incassato.
-- I costi sostenuti restano contati; il credito residuo e l'utile stimato no.
--
-- E' una colonna a se' e NON un decimo valore di `stato`: lo stato di lavorazione
-- ("Consegnato") e l'esigibilita' del credito sono due fatti indipendenti, e cosi'
-- il CHECK su commesse.stato resta intatto.
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS inesigibile BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN commesse.inesigibile IS
  'Credito che non sara'' incassato: esclude il residuo dai crediti e l''utile dai costi stimati.';
