-- Fix vincolo clienti: permetti aziende (ragione_sociale) senza nome/cognome
ALTER TABLE clienti
  DROP CONSTRAINT clienti_nome_or_cognome;

ALTER TABLE clienti
  ADD CONSTRAINT clienti_nome_or_ragione_sociale CHECK (
    (tipo = 'azienda' AND ragione_sociale IS NOT NULL AND ragione_sociale <> '')
    OR
    ((nome IS NOT NULL AND nome <> '') OR (cognome IS NOT NULL AND cognome <> ''))
  );
