-- Scadenze "da programmare": conosciute come importo e fornitore, ma non ancora
-- collocate in una data di pagamento.
--
-- Regola unica: scadenza senza data = scadenza da programmare. Non serve un
-- flag a parte, l'assenza della data dice tutto in ogni punto del programma.
ALTER TABLE scadenze ALTER COLUMN data_scadenza DROP NOT NULL;

-- Le righe senza data vivono in un blocco di sistema, uno solo per
-- organizzazione: qui il vincolo, cosi' non dipende dall'interfaccia.
CREATE UNIQUE INDEX IF NOT EXISTS gruppi_commesse_da_programmare_unico
  ON gruppi_commesse (organization_id)
  WHERE tipo = 'da_programmare';
