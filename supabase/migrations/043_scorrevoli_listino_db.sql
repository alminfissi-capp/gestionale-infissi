-- Sposta il listino scorrevoli dal filesystem a Supabase
-- Un record per organizzazione, contiene l'intero JSON del listino

CREATE TABLE IF NOT EXISTS scorrevoli_listino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE scorrevoli_listino ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read scorrevoli_listino"
  ON scorrevoli_listino FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org members can upsert scorrevoli_listino"
  ON scorrevoli_listino FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
