-- ============================================================
-- magazzino.sql
-- Modulo Magazzino: fornitori, categorie, anagrafica prodotti,
-- varianti, movimenti, view giacenze
-- ============================================================

-- ---- fornitori ----
CREATE TABLE fornitori (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  partita_iva     TEXT,
  telefono        TEXT,
  email           TEXT,
  indirizzo       TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- categorie_magazzino ----
CREATE TABLE categorie_magazzino (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('alluminio','ferro','accessori','pannelli','chimici')),
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- anagrafica_prodotti ----
CREATE TABLE anagrafica_prodotti (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codice                   TEXT NOT NULL,
  nome                     TEXT NOT NULL,
  descrizione              TEXT,
  categoria_id             UUID REFERENCES categorie_magazzino(id) ON DELETE SET NULL,
  unita_misura             TEXT NOT NULL CHECK (unita_misura IN ('pz','ml','cop','kg','pacco','lt','m2')),
  prezzo_acquisto          NUMERIC(10,4),
  fornitore_principale_id  UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  soglia_minima            NUMERIC(10,3),
  soglia_abilitata         BOOLEAN NOT NULL DEFAULT false,
  foto_url                 TEXT,
  dxf_url                  TEXT,
  note                     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- varianti_prodotto ----
CREATE TABLE varianti_prodotto (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prodotto_id     UUID NOT NULL REFERENCES anagrafica_prodotti(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  codice_variante TEXT,
  foto_url        TEXT,
  dxf_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- movimenti_magazzino ----
CREATE TABLE movimenti_magazzino (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrata','uscita')),
  prodotto_id     UUID NOT NULL REFERENCES anagrafica_prodotti(id) ON DELETE RESTRICT,
  variante_id     UUID REFERENCES varianti_prodotto(id) ON DELETE RESTRICT,
  quantita        NUMERIC(10,3) NOT NULL CHECK (quantita > 0),
  prezzo_unitario NUMERIC(10,4),
  fornitore_id    UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  commessa_ref    TEXT,
  data            DATE NOT NULL DEFAULT CURRENT_DATE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- view giacenze ----
CREATE VIEW giacenze WITH (security_invoker = true) AS
  SELECT
    p.organization_id,
    p.id          AS prodotto_id,
    p.codice,
    p.nome        AS prodotto_nome,
    p.unita_misura,
    v.id          AS variante_id,
    v.nome        AS variante_nome,
    COALESCE(
      SUM(CASE WHEN m.tipo = 'entrata' THEN m.quantita ELSE -m.quantita END),
      0
    ) AS giacenza_attuale
  FROM anagrafica_prodotti p
  LEFT JOIN varianti_prodotto v ON v.prodotto_id = p.id
  LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
    AND (m.variante_id = v.id OR (m.variante_id IS NULL AND v.id IS NULL))
  GROUP BY p.organization_id, p.id, p.codice, p.nome, p.unita_misura, v.id, v.nome;

-- ---- RLS ----
ALTER TABLE fornitori ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorie_magazzino ENABLE ROW LEVEL SECURITY;
ALTER TABLE anagrafica_prodotti ENABLE ROW LEVEL SECURITY;
ALTER TABLE varianti_prodotto ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_magazzino ENABLE ROW LEVEL SECURITY;

-- fornitori
CREATE POLICY "fornitori_select" ON fornitori FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fornitori_insert" ON fornitori FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "fornitori_update" ON fornitori FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "fornitori_delete" ON fornitori FOR DELETE USING (organization_id = get_user_organization_id());

-- categorie_magazzino
CREATE POLICY "cat_mag_select" ON categorie_magazzino FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "cat_mag_insert" ON categorie_magazzino FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "cat_mag_update" ON categorie_magazzino FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "cat_mag_delete" ON categorie_magazzino FOR DELETE USING (organization_id = get_user_organization_id());

-- anagrafica_prodotti
CREATE POLICY "prodotti_select" ON anagrafica_prodotti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_insert" ON anagrafica_prodotti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_update" ON anagrafica_prodotti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "prodotti_delete" ON anagrafica_prodotti FOR DELETE USING (organization_id = get_user_organization_id());

-- varianti_prodotto: accesso tramite join con anagrafica_prodotti
CREATE POLICY "varianti_select" ON varianti_prodotto FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM anagrafica_prodotti ap
    WHERE ap.id = varianti_prodotto.prodotto_id
      AND ap.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_insert" ON varianti_prodotto FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM anagrafica_prodotti ap
    WHERE ap.id = varianti_prodotto.prodotto_id
      AND ap.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_update" ON varianti_prodotto FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM anagrafica_prodotti ap
    WHERE ap.id = varianti_prodotto.prodotto_id
      AND ap.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_delete" ON varianti_prodotto FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM anagrafica_prodotti ap
    WHERE ap.id = varianti_prodotto.prodotto_id
      AND ap.organization_id = get_user_organization_id()
  ));

-- movimenti_magazzino
CREATE POLICY "movimenti_select" ON movimenti_magazzino FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_insert" ON movimenti_magazzino FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_update" ON movimenti_magazzino FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_delete" ON movimenti_magazzino FOR DELETE USING (organization_id = get_user_organization_id());

-- ---- Storage bucket magazzino ----
INSERT INTO storage.buckets (id, name, public)
VALUES ('magazzino', 'magazzino', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "magazzino_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'magazzino'
    AND (storage.foldername(name))[1] = (get_user_organization_id())::text
  );
CREATE POLICY "magazzino_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'magazzino'
    AND (storage.foldername(name))[1] = (get_user_organization_id())::text
  );
CREATE POLICY "magazzino_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'magazzino'
    AND (storage.foldername(name))[1] = (get_user_organization_id())::text
  );
CREATE POLICY "magazzino_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'magazzino'
    AND (storage.foldername(name))[1] = (get_user_organization_id())::text
  );
