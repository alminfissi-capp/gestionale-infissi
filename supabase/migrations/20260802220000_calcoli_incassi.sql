-- Incassi in attesa nei Calcoli: entrate che non nascono da una commessa
-- (rimborsi, note di credito, prestiti da farsi restituire)
CREATE TABLE calcoli_incassi (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                text        NOT NULL DEFAULT '',
  descrizione         text        NOT NULL DEFAULT '',
  importo             numeric     NOT NULL DEFAULT 0,
  incasso_concordato  numeric,
  incassato           boolean     NOT NULL DEFAULT false,
  ordine              int         NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE calcoli_incassi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON calcoli_incassi
  FOR ALL USING (organization_id = get_user_organization_id());
