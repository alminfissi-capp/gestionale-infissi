-- Righe libere dei Calcoli: giacenze banca / contanti / liquidità corrente
CREATE TABLE calcoli_righe (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  descrizione      text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE calcoli_righe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON calcoli_righe
  FOR ALL USING (organization_id = get_user_organization_id());
