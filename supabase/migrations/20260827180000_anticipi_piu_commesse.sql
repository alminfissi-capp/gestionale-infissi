-- Un anticipo può coprire più commesse: una sola fattura emessa per più lavori.
-- Il legame diventa molti-a-molti; l'importo NON si spezza per commessa, perché la
-- banca anticipa la fattura, non il singolo lavoro. Le commesse collegate servono a
-- sommare quanto il cliente deve ancora.
CREATE TABLE anticipi_commesse (
  anticipo_id      uuid        NOT NULL REFERENCES anticipi_fattura(id) ON DELETE CASCADE,
  commessa_id      uuid        NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (anticipo_id, commessa_id)
);

ALTER TABLE anticipi_commesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON anticipi_commesse
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX anticipi_commesse_org_idx ON anticipi_commesse (organization_id);
CREATE INDEX anticipi_commesse_commessa_idx ON anticipi_commesse (commessa_id);

-- Travaso dei legami già inseriti. La colonna `anticipi_fattura.commessa_id` resta
-- ancora al suo posto: viene tolta da una migrazione separata, dopo aver verificato
-- che il travaso sia completo.
INSERT INTO anticipi_commesse (anticipo_id, commessa_id, organization_id)
SELECT id, commessa_id, organization_id
FROM anticipi_fattura
WHERE commessa_id IS NOT NULL
ON CONFLICT DO NOTHING;
