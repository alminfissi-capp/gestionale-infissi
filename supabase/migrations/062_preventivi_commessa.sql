-- ============================================================
-- 062_preventivi_commessa.sql
-- Supporto a più preventivi per commessa
-- ============================================================

CREATE TABLE preventivi_commessa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commessa_id UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  preventivo_id UUID REFERENCES preventivi(id) ON DELETE SET NULL,
  numero_preventivo TEXT,
  nome_file TEXT,
  storage_path TEXT,
  ordine INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE preventivi_commessa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select" ON preventivi_commessa FOR SELECT
  USING (organization_id = get_user_organization_id());
CREATE POLICY "pc_insert" ON preventivi_commessa FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "pc_update" ON preventivi_commessa FOR UPDATE
  USING (organization_id = get_user_organization_id());
CREATE POLICY "pc_delete" ON preventivi_commessa FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Migra i preventivi singoli già esistenti
INSERT INTO preventivi_commessa (commessa_id, organization_id, preventivo_id, numero_preventivo)
SELECT id, organization_id, preventivo_id, numero_preventivo
FROM commesse
WHERE preventivo_id IS NOT NULL
   OR (numero_preventivo IS NOT NULL AND numero_preventivo != '');
