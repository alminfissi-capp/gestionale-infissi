-- Nuovo sistema inventario semplice (sostituisce movimenti/giacenze).
-- Si aggiunge accanto alle tabelle esistenti; le vecchie restano per retrocompatibilità
-- ma non vengono più usate dall'applicazione.

CREATE TABLE IF NOT EXISTS articoli_magazzino (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prodotto_id     UUID REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL,
  finitura        TEXT,
  quantita        NUMERIC(10,3) NOT NULL DEFAULT 0,
  quantita_2      NUMERIC(10,3),
  unita_misura_2  TEXT,
  posizione_id    UUID REFERENCES posizioni_magazzino(id) ON DELETE SET NULL,
  fornitore_id    UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  commessa        TEXT,
  note            TEXT,
  ordine          INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE articoli_magazzino ENABLE ROW LEVEL SECURITY;

CREATE POLICY "am_select" ON articoli_magazzino FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "am_insert" ON articoli_magazzino FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "am_update" ON articoli_magazzino FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "am_delete" ON articoli_magazzino FOR DELETE USING (organization_id = get_user_organization_id());
