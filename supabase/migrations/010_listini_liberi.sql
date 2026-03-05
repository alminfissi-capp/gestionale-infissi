-- ============================================================
-- 010_listini_liberi.sql
-- Aggiunge supporto per categorie tipo 'libero' (catalogo prodotti)
-- con listini liberi, prodotti e accessori
-- ============================================================

-- Tipo categoria (default 'griglia' per retrocompatibilità)
ALTER TABLE categorie_listini
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'griglia'
  CHECK (tipo IN ('griglia', 'libero'));

-- ---- Listini liberi (catalogo prodotti) ----
CREATE TABLE listini_liberi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorie_listini(id) ON DELETE CASCADE,
  tipologia TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(categoria_id, tipologia)
);

CREATE INDEX idx_listini_liberi_cat ON listini_liberi(categoria_id);

-- ---- Prodotti principali del listino ----
CREATE TABLE prodotti_listino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listino_libero_id UUID NOT NULL REFERENCES listini_liberi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  prezzo NUMERIC(10,2) NOT NULL DEFAULT 0,
  descrizione TEXT,
  immagine_url TEXT,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prodotti_listino ON prodotti_listino(listino_libero_id);

-- ---- Accessori globali al listino ----
CREATE TABLE accessori_listino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listino_libero_id UUID NOT NULL REFERENCES listini_liberi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  prezzo NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accessori_listino ON accessori_listino(listino_libero_id);

-- ---- Aggiorna articoli_preventivo ----
ALTER TABLE articoli_preventivo
  DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;

ALTER TABLE articoli_preventivo
  ADD CONSTRAINT articoli_preventivo_tipo_check
    CHECK (tipo IN ('listino', 'libera', 'listino_libero'));

ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS listino_libero_id UUID REFERENCES listini_liberi(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prodotto_id UUID REFERENCES prodotti_listino(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accessori_selezionati JSONB DEFAULT '[]';

-- ---- RLS ----
ALTER TABLE listini_liberi ENABLE ROW LEVEL SECURITY;
ALTER TABLE prodotti_listino ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessori_listino ENABLE ROW LEVEL SECURITY;

-- listini_liberi
CREATE POLICY "listini_liberi_select" ON listini_liberi
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_liberi_insert" ON listini_liberi
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "listini_liberi_update" ON listini_liberi
  FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_liberi_delete" ON listini_liberi
  FOR DELETE USING (organization_id = get_user_organization_id());

-- prodotti_listino
CREATE POLICY "prodotti_listino_select" ON prodotti_listino
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_listino_insert" ON prodotti_listino
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_listino_update" ON prodotti_listino
  FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_listino_delete" ON prodotti_listino
  FOR DELETE USING (organization_id = get_user_organization_id());

-- accessori_listino
CREATE POLICY "accessori_listino_select" ON accessori_listino
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "accessori_listino_insert" ON accessori_listino
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "accessori_listino_update" ON accessori_listino
  FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "accessori_listino_delete" ON accessori_listino
  FOR DELETE USING (organization_id = get_user_organization_id());
