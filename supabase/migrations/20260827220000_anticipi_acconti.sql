-- Gli acconti del cliente che la banca ha trattenuto per rientrare dall'anticipo.
-- La scelta è sempre manuale: la banca a volte trattiene l'acconto, a volte no, quindi
-- il collegamento lo fa una persona, acconto per acconto.
--
-- La chiave primaria è il solo `acconto_id`, non la coppia: **un acconto può rientrare
-- su un solo anticipo**. Se potesse stare su due, gli stessi soldi verrebbero scalati
-- due volte e il debito verso la banca risulterebbe più basso del vero. È l'invariante
-- che questa tabella esiste per difendere.
CREATE TABLE anticipi_acconti (
  acconto_id       uuid        PRIMARY KEY REFERENCES acconti_commessa(id) ON DELETE CASCADE,
  anticipo_id      uuid        NOT NULL REFERENCES anticipi_fattura(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE anticipi_acconti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON anticipi_acconti
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX anticipi_acconti_org_idx ON anticipi_acconti (organization_id);
CREATE INDEX anticipi_acconti_anticipo_idx ON anticipi_acconti (anticipo_id);
