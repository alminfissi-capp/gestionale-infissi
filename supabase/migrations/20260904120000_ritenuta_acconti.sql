-- 20260904120000_ritenuta_acconti.sql
-- Ritenuta d'acconto sui bonifici per detrazioni fiscali.
--
-- Il cliente bonifica il lordo e non deve piu' niente: la banca ne trattiene una
-- quota (11% dell'imponibile scorporato al 22%) e la versa all'Erario come
-- acconto d'imposta. `importo` resta quindi il lordo bonificato e la colonna
-- nuova dice quanto di quel lordo non e' mai arrivato in banca.
--
-- Si salva la CIFRA in euro, non una spunta: l'aliquota era all'8% fino al 2022
-- ed e' all'11% da allora. Con un booleano, il giorno che cambia di nuovo, tutti
-- i pagamenti gia' registrati si riscriverebbero da soli con la percentuale
-- sbagliata. L'incassato non si salva: e' `importo - ritenuta`, e un terzo
-- numero sarebbe solo una cosa in piu' da tenere in accordo con le altre due.

ALTER TABLE acconti_commessa
  ADD COLUMN IF NOT EXISTS ritenuta NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE acconti_commessa
  DROP CONSTRAINT IF EXISTS acconti_commessa_ritenuta_valida;

ALTER TABLE acconti_commessa
  ADD CONSTRAINT acconti_commessa_ritenuta_valida
  CHECK (ritenuta >= 0 AND ritenuta < importo);

-- La tabella nasceva con le sole policy SELECT/INSERT/DELETE: senza questa, gli
-- acconti gia' registrati non sarebbero marcabili e resterebbero per sempre al
-- lordo nel flusso di cassa.
DROP POLICY IF EXISTS "acconti_commessa_update" ON acconti_commessa;

CREATE POLICY "acconti_commessa_update" ON acconti_commessa
  FOR UPDATE USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
