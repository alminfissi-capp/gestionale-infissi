-- ============================================================
-- 20260722210000_allegati_ordine_fornitore.sql
-- Allegati (PDF/foto, multipli) legati al singolo ordine fornitore
-- ============================================================

CREATE TABLE allegati_ordine_fornitore (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine_id       UUID NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  nome_file       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  content_type    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_allegati_ordine_ordine ON allegati_ordine_fornitore(ordine_id);
CREATE INDEX idx_allegati_ordine_org    ON allegati_ordine_fornitore(organization_id);

ALTER TABLE allegati_ordine_fornitore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allegati_ordine_select" ON allegati_ordine_fornitore FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "allegati_ordine_insert" ON allegati_ordine_fornitore FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "allegati_ordine_update" ON allegati_ordine_fornitore FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "allegati_ordine_delete" ON allegati_ordine_fornitore FOR DELETE USING (organization_id = get_user_organization_id());
