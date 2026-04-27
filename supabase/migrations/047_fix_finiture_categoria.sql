-- ============================================================
-- 047_fix_finiture_categoria.sql
-- Fix conflitto nome tabella: finiture_categoria era stata
-- sovrascritta dalla migration 045 (magazzino).
-- Rinomina la tabella magazzino → finiture_magazzino e ricrea
-- la finiture_categoria originale (FK a categorie_listini).
-- ============================================================

-- 1. Rinomina tabella magazzino
ALTER TABLE finiture_categoria RENAME TO finiture_magazzino;

-- 2. Rinomina policies sulla tabella rinominata
ALTER POLICY "finitura_select" ON finiture_magazzino RENAME TO "finiture_mag_select";
ALTER POLICY "finitura_insert" ON finiture_magazzino RENAME TO "finiture_mag_insert";
ALTER POLICY "finitura_update" ON finiture_magazzino RENAME TO "finiture_mag_update";
ALTER POLICY "finitura_delete" ON finiture_magazzino RENAME TO "finiture_mag_delete";

-- 3. Ricrea tabella originale finiture_categoria (listini categorie)
CREATE TABLE finiture_categoria (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id        UUID        NOT NULL REFERENCES categorie_listini(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  aumento_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0,
  aumento_euro        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordine              INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finiture_categoria ON finiture_categoria(categoria_id);

ALTER TABLE finiture_categoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finiture_cat_select" ON finiture_categoria
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_insert" ON finiture_categoria
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_update" ON finiture_categoria
  FOR UPDATE USING (organization_id = get_user_organization_id());

CREATE POLICY "finiture_cat_delete" ON finiture_categoria
  FOR DELETE USING (organization_id = get_user_organization_id());
