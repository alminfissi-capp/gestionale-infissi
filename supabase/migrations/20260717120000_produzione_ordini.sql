-- ============================================================
-- 20260717120000_produzione_ordini.sql
-- Sezione Produzione: ordini fornitore e righe
-- ============================================================

CREATE TABLE ordini_fornitore (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id            UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  fornitore_id           UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  numero_ordine          TEXT NOT NULL DEFAULT '',
  data_ordine            DATE NOT NULL DEFAULT CURRENT_DATE,
  data_consegna_prevista DATE,
  stato                  TEXT NOT NULL DEFAULT 'da_ordinare'
    CHECK (stato IN ('da_ordinare', 'ordinato', 'arrivato', 'annullato')),
  pdf_path               TEXT,
  inviato_at             TIMESTAMPTZ,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE righe_ordine_fornitore (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordine_id       UUID NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  descrizione     TEXT NOT NULL,
  quantita        NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantita > 0),
  unita_misura    TEXT NOT NULL DEFAULT 'pz',
  prezzo_unitario NUMERIC(10,4),
  ordine          INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordini_fornitore_org_stato ON ordini_fornitore(organization_id, stato);
CREATE INDEX idx_ordini_fornitore_commessa  ON ordini_fornitore(commessa_id);
CREATE INDEX idx_ordini_fornitore_fornitore ON ordini_fornitore(fornitore_id);
CREATE INDEX idx_righe_ordine_ordine        ON righe_ordine_fornitore(ordine_id);

ALTER TABLE ordini_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE righe_ordine_fornitore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordini_fornitore_select" ON ordini_fornitore FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_insert" ON ordini_fornitore FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_update" ON ordini_fornitore FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "ordini_fornitore_delete" ON ordini_fornitore FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "righe_ordine_select" ON righe_ordine_fornitore FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_insert" ON righe_ordine_fornitore FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_update" ON righe_ordine_fornitore FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "righe_ordine_delete" ON righe_ordine_fornitore FOR DELETE USING (organization_id = get_user_organization_id());
