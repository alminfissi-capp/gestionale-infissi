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

CREATE POLICY "scorrevoli_listino_select"
  ON scorrevoli_listino FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "scorrevoli_listino_insert"
  ON scorrevoli_listino FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "scorrevoli_listino_update"
  ON scorrevoli_listino FOR UPDATE
  USING (organization_id = get_user_organization_id());
