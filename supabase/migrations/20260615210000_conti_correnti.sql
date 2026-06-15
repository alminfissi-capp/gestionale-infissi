-- Conti correnti (anagrafica banche): saldo attuale + collegamento alle scadenze
CREATE TABLE conti_correnti (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  saldo_attuale    numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE conti_correnti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON conti_correnti
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX conti_correnti_org_idx ON conti_correnti (organization_id);

-- Conto su cui viene addebitata la scadenza (facoltativo)
ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS conto_id uuid REFERENCES conti_correnti(id) ON DELETE SET NULL;
