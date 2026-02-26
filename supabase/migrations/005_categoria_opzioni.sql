-- ============================================================
-- 005_categoria_opzioni.sql
-- Opzioni e regole configurabili per categoria listini
-- ============================================================

-- 1. Nuovi campi di configurazione su categorie_listini
ALTER TABLE categorie_listini
  ADD COLUMN trasporto_costo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN trasporto_costo_minimo   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN trasporto_minimo_pezzi   INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN sconto_fornitore         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN sconto_massimo           NUMERIC(4,2)  NOT NULL DEFAULT 50;

-- 2. Aggiunge aumento_euro alle finiture per-listino
ALTER TABLE finiture
  ADD COLUMN aumento_euro NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Aggiunge finitura_aumento_euro agli articoli dei preventivi
ALTER TABLE articoli_preventivo
  ADD COLUMN finitura_aumento_euro NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 4. Nuova tabella finiture a livello categoria
CREATE TABLE finiture_categoria (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id    UUID NOT NULL REFERENCES categorie_listini(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  aumento_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0,
  aumento_euro    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finiture_categoria ON finiture_categoria(categoria_id);

-- 5. RLS su finiture_categoria
ALTER TABLE finiture_categoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finiture_cat_select" ON finiture_categoria
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_insert" ON finiture_categoria
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_update" ON finiture_categoria
  FOR UPDATE USING (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_delete" ON finiture_categoria
  FOR DELETE USING (organization_id = get_user_organization_id());
