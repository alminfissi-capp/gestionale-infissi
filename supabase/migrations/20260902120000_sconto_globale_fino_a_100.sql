-- Sconto globale fino al 100%.
--
-- La colonna nasceva NUMERIC(4,2) CHECK (BETWEEN 0 AND 60): due muri distinti.
-- Il wizard invece lascia scrivere fino a 100 (`Math.min(val, 100)` in
-- WizardPreventivo.handleScontoGlobaleStrBlur), e lo stesso valore lo produce
-- lo sconto in euro pari all'intero imponibile — (capped / grosso) * 100 = 100.
-- Risultato: salvare un preventivo scontato oltre il 60% falliva con 23514
-- (check violato) e proprio al 100% con 22003 (numeric field overflow: NUMERIC(4,2)
-- arriva a 99,99), e l'utente vedeva solo il messaggio generico
-- "An error occurred in the Server Components render".
--
-- NUMERIC(5,2) regge 100,00; il nuovo CHECK ammette l'intero intervallo 0-100.
-- È un allargamento: nessun dato esistente viene toccato o perso.

ALTER TABLE preventivi
  DROP CONSTRAINT IF EXISTS preventivi_sconto_globale_check;

ALTER TABLE preventivi
  ALTER COLUMN sconto_globale TYPE NUMERIC(5,2);

ALTER TABLE preventivi
  ADD CONSTRAINT preventivi_sconto_globale_check
  CHECK (sconto_globale BETWEEN 0 AND 100);
