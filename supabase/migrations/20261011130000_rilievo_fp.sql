-- ============================================================
-- 20261011130000_rilievo_fp.sql
-- Fase 3: rilievo in cantiere con le strutture di FP PRO.
-- La voce nuova sta tutta in rilievo_veloce_voci.fp (jsonb); le colonne vecchie
-- restano ma non si usano piu'. updated_at serve al telefono per capire chi e'
-- piu' recente (vince la modifica piu' recente).
-- ============================================================

ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS fp jsonb;
ALTER TABLE rilievo_veloce_voci ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rilievo_voci_updated ON rilievo_veloce_voci(organization_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_rilievi_veloci_updated ON rilievi_veloci(organization_id, updated_at);

-- Strutture preferite e liste brevi di colori/vetri, per azienda.
CREATE TABLE IF NOT EXISTS fp_preferenze (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('struttura', 'colore', 'vetro')),
  rif             text NOT NULL,
  ordine          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tipo, rif)
);

ALTER TABLE fp_preferenze ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_preferenze_select" ON fp_preferenze
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fp_preferenze_insert" ON fp_preferenze
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "fp_preferenze_delete" ON fp_preferenze
  FOR DELETE USING (organization_id = get_user_organization_id());
