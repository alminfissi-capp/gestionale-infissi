-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security policies per tutte le tabelle
-- ============================================================

-- Abilitazione RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorie_listini ENABLE ROW LEVEL SECURITY;
ALTER TABLE listini ENABLE ROW LEVEL SECURITY;
ALTER TABLE finiture ENABLE ROW LEVEL SECURITY;
ALTER TABLE preventivi ENABLE ROW LEVEL SECURITY;
ALTER TABLE articoli_preventivo ENABLE ROW LEVEL SECURITY;

-- Helper: ottieni organization_id dell'utente corrente
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- organizations ----
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (id = get_user_organization_id());

-- ---- profiles ----
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (id = auth.uid());

-- ---- settings ----
CREATE POLICY "settings_select" ON settings FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "settings_delete" ON settings FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- note_templates ----
CREATE POLICY "note_templates_select" ON note_templates FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "note_templates_insert" ON note_templates FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "note_templates_update" ON note_templates FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "note_templates_delete" ON note_templates FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- clienti ----
CREATE POLICY "clienti_select" ON clienti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "clienti_insert" ON clienti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "clienti_update" ON clienti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "clienti_delete" ON clienti FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- categorie_listini ----
CREATE POLICY "categorie_select" ON categorie_listini FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "categorie_insert" ON categorie_listini FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "categorie_update" ON categorie_listini FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "categorie_delete" ON categorie_listini FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- listini ----
CREATE POLICY "listini_select" ON listini FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_insert" ON listini FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "listini_update" ON listini FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_delete" ON listini FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- finiture ----
-- Le finiture ereditano i permessi tramite join con listini
CREATE POLICY "finiture_select" ON finiture
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM listini l WHERE l.id = listino_id AND l.organization_id = get_user_organization_id())
  );
CREATE POLICY "finiture_insert" ON finiture
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM listini l WHERE l.id = listino_id AND l.organization_id = get_user_organization_id())
  );
CREATE POLICY "finiture_update" ON finiture
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM listini l WHERE l.id = listino_id AND l.organization_id = get_user_organization_id())
  );
CREATE POLICY "finiture_delete" ON finiture
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM listini l WHERE l.id = listino_id AND l.organization_id = get_user_organization_id())
  );

-- ---- preventivi ----
CREATE POLICY "preventivi_select" ON preventivi FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "preventivi_insert" ON preventivi FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "preventivi_update" ON preventivi FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "preventivi_delete" ON preventivi FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- articoli_preventivo ----
CREATE POLICY "articoli_select" ON articoli_preventivo FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "articoli_insert" ON articoli_preventivo FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "articoli_update" ON articoli_preventivo FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "articoli_delete" ON articoli_preventivo FOR DELETE USING (organization_id = get_user_organization_id());
