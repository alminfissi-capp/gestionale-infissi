-- Finiture per categorie alluminio/ferro
CREATE TABLE finiture_categoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES categorie_magazzino(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  costo_per_kg NUMERIC(10,4),
  costo_per_metro NUMERIC(10,4),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finiture_categoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finitura_select" ON finiture_categoria FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "finitura_insert" ON finiture_categoria FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "finitura_update" ON finiture_categoria FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "finitura_delete" ON finiture_categoria FOR DELETE USING (organization_id = get_user_organization_id());

-- Posizioni / scaffalature magazzino
CREATE TABLE posizioni_magazzino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descrizione TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE posizioni_magazzino ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posizione_select" ON posizioni_magazzino FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "posizione_insert" ON posizioni_magazzino FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "posizione_update" ON posizioni_magazzino FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "posizione_delete" ON posizioni_magazzino FOR DELETE USING (organization_id = get_user_organization_id());

-- Nuovi campi su anagrafica_prodotti
ALTER TABLE anagrafica_prodotti
  ADD COLUMN peso_al_metro NUMERIC(10,4),
  ADD COLUMN lunghezza_default NUMERIC(10,4),
  ADD COLUMN posizione_id UUID REFERENCES posizioni_magazzino(id) ON DELETE SET NULL;

-- Aggiorna CHECK constraint unita_misura per includere 'barre'
ALTER TABLE anagrafica_prodotti
  DROP CONSTRAINT IF EXISTS anagrafica_prodotti_unita_misura_check;
ALTER TABLE anagrafica_prodotti
  ADD CONSTRAINT anagrafica_prodotti_unita_misura_check
  CHECK (unita_misura = ANY (ARRAY['pz','ml','cop','kg','pacco','lt','m2','barre']));

-- Nuovi campi su movimenti_magazzino
ALTER TABLE movimenti_magazzino
  ADD COLUMN finitura_id UUID REFERENCES finiture_categoria(id) ON DELETE SET NULL,
  ADD COLUMN lunghezza NUMERIC(10,4);
