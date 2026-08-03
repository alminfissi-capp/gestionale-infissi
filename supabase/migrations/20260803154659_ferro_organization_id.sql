-- Isolamento per organizzazione delle tabelle Ferro.
-- Prima d'ora avevano policy "FOR ALL USING (true)": qualsiasi utente
-- autenticato, di qualunque organizzazione, poteva leggerle e modificarle.
-- Il calcolatore Ferro le scrive direttamente dal browser (components/ferro/
-- FerroCalcolatore.tsx, makeCrud), quindi la RLS e' l'unica barriera esistente.
--
-- L'ordine conta: NOT NULL solo dopo aver riempito le righe gia' presenti.
-- Il DEFAULT get_user_organization_id() evita di dover passare l'id dal client:
-- Postgres riempie da solo la colonna a ogni inserimento, e il WITH CHECK
-- impedisce comunque di scrivere righe di un'altra organizzazione.

-- ── ferro_sezioni_piene ──────────────────────────────────────────
ALTER TABLE ferro_sezioni_piene
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ferro_sezioni_piene
  SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  WHERE organization_id IS NULL;
ALTER TABLE ferro_sezioni_piene ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ferro_sezioni_piene ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
CREATE INDEX ferro_sezioni_piene_org_idx ON ferro_sezioni_piene (organization_id);
DROP POLICY IF EXISTS "ferro_sezioni_piene_auth" ON ferro_sezioni_piene;
CREATE POLICY "org_access" ON ferro_sezioni_piene FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── ferro_sezioni_colonna ────────────────────────────────────────
ALTER TABLE ferro_sezioni_colonna
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ferro_sezioni_colonna
  SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  WHERE organization_id IS NULL;
ALTER TABLE ferro_sezioni_colonna ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ferro_sezioni_colonna ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
CREATE INDEX ferro_sezioni_colonna_org_idx ON ferro_sezioni_colonna (organization_id);
DROP POLICY IF EXISTS "ferro_sezioni_colonna_auth" ON ferro_sezioni_colonna;
CREATE POLICY "org_access" ON ferro_sezioni_colonna FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── ferro_binari ─────────────────────────────────────────────────
ALTER TABLE ferro_binari
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ferro_binari
  SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  WHERE organization_id IS NULL;
ALTER TABLE ferro_binari ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ferro_binari ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
CREATE INDEX ferro_binari_org_idx ON ferro_binari (organization_id);
DROP POLICY IF EXISTS "ferro_binari_auth" ON ferro_binari;
CREATE POLICY "org_access" ON ferro_binari FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── ferro_accessori ──────────────────────────────────────────────
ALTER TABLE ferro_accessori
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ferro_accessori
  SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  WHERE organization_id IS NULL;
ALTER TABLE ferro_accessori ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ferro_accessori ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
CREATE INDEX ferro_accessori_org_idx ON ferro_accessori (organization_id);
DROP POLICY IF EXISTS "ferro_accessori_auth" ON ferro_accessori;
CREATE POLICY "org_access" ON ferro_accessori FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── ferro_preventivi ─────────────────────────────────────────────
ALTER TABLE ferro_preventivi
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ferro_preventivi
  SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  WHERE organization_id IS NULL;
ALTER TABLE ferro_preventivi ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ferro_preventivi ALTER COLUMN organization_id SET DEFAULT get_user_organization_id();
CREATE INDEX ferro_preventivi_org_idx ON ferro_preventivi (organization_id);
DROP POLICY IF EXISTS "ferro_preventivi_auth" ON ferro_preventivi;
CREATE POLICY "org_access" ON ferro_preventivi FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- crm_sessions: RLS attiva senza policy e' voluto, non una dimenticanza.
COMMENT ON TABLE crm_sessions IS
  'Solo service role: contiene i cookie di sessione del CRM. RLS attiva senza policy di proposito, per negare ogni accesso via API pubblica.';
