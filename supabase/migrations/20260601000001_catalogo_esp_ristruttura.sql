-- ============================================================
-- Ristruttura il modulo magazzino sul modello nativo catalogo.db
-- Demolisce anagrafica_prodotti e introduce catalogo_articoli
-- (reparto/gruppo/um nativi + search_vector GIN).
-- Aggiunge catalogo_prezzi per cache prezzi live backend ESP.
-- ============================================================

-- ── 1. Drop vista dipendente ────────────────────────────────
DROP VIEW IF EXISTS giacenze;

-- ── 2. Drop policy varianti_prodotto che referenziano anagrafica ─
DROP POLICY IF EXISTS "varianti_select" ON varianti_prodotto;
DROP POLICY IF EXISTS "varianti_insert" ON varianti_prodotto;
DROP POLICY IF EXISTS "varianti_update" ON varianti_prodotto;
DROP POLICY IF EXISTS "varianti_delete" ON varianti_prodotto;

-- ── 3. Drop FK constraint verso anagrafica_prodotti ─────────
ALTER TABLE movimenti_magazzino
  DROP CONSTRAINT IF EXISTS movimenti_magazzino_prodotto_id_fkey;

ALTER TABLE varianti_prodotto
  DROP CONSTRAINT IF EXISTS varianti_prodotto_prodotto_id_fkey;

ALTER TABLE articoli_magazzino
  DROP CONSTRAINT IF EXISTS articoli_magazzino_prodotto_id_fkey;

-- ── 4. Svuota tabelle dipendenti (dati non recuperabili) ────
TRUNCATE movimenti_magazzino, articoli_magazzino, varianti_prodotto CASCADE;

-- ── 5. Drop indici anagrafica_prodotti ───────────────────────
DROP INDEX IF EXISTS idx_anagrafica_prodotti_org_tipologia;
DROP INDEX IF EXISTS idx_anagrafica_prodotti_org_materiale;
DROP INDEX IF EXISTS idx_anagrafica_prodotti_org_origine;

-- ── 6. Drop RPC manuali catalogo ESP (potrebbero non esistere) ─
DROP FUNCTION IF EXISTS count_esp_tipologie(uuid);
DROP FUNCTION IF EXISTS count_esp_materiali(uuid);

-- ── 7. Drop anagrafica_prodotti e policy ────────────────────
DROP POLICY IF EXISTS "prodotti_select" ON anagrafica_prodotti;
DROP POLICY IF EXISTS "prodotti_insert" ON anagrafica_prodotti;
DROP POLICY IF EXISTS "prodotti_update" ON anagrafica_prodotti;
DROP POLICY IF EXISTS "prodotti_delete" ON anagrafica_prodotti;
DROP TABLE IF EXISTS anagrafica_prodotti;

-- ── 8. catalogo_articoli ────────────────────────────────────
CREATE TABLE catalogo_articoli (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codice                   TEXT NOT NULL,
  descrizione              TEXT NOT NULL DEFAULT '',
  -- campi nativi ESP
  um                       TEXT NOT NULL DEFAULT '',       -- valore raw: 'ACC. PEZZO', 'BR', 'MT', …
  reparto                  SMALLINT,                       -- 1-6: ALLUMINIO, FERRO, ACCESSORI, MACCHINE UTENSILI, ACCIAIO INOX, PVC
  gruppo                   TEXT,                           -- 348 gruppi merceologici
  immagine_url             TEXT,
  -- campi gestione magazzino
  categoria_id             UUID REFERENCES categorie_magazzino(id) ON DELETE SET NULL,
  prezzo_acquisto          NUMERIC(10,4),
  fornitore_principale_id  UUID REFERENCES fornitori(id) ON DELETE SET NULL,
  posizione_id             UUID REFERENCES posizioni_magazzino(id) ON DELETE SET NULL,
  soglia_minima            NUMERIC(10,3),
  soglia_abilitata         BOOLEAN NOT NULL DEFAULT false,
  peso_al_metro            NUMERIC(10,4),
  lunghezza_default        NUMERIC(10,4),
  foto_url                 TEXT,
  dxf_url                  TEXT,
  note                     TEXT,
  -- full-text search
  search_vector            tsvector,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, codice)
);

CREATE INDEX idx_ca_org_reparto_gruppo
  ON catalogo_articoli (organization_id, reparto, gruppo);

CREATE INDEX idx_ca_search_vector
  ON catalogo_articoli USING GIN (search_vector);

-- Trigger: aggiorna search_vector su insert/update
CREATE OR REPLACE FUNCTION trg_fn_ca_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple',
      coalesce(NEW.codice, '') || ' ' || coalesce(NEW.descrizione, '')
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ca_search_vector
  BEFORE INSERT OR UPDATE OF codice, descrizione
  ON catalogo_articoli
  FOR EACH ROW EXECUTE FUNCTION trg_fn_ca_search_vector();

ALTER TABLE catalogo_articoli ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca_select" ON catalogo_articoli FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "ca_insert" ON catalogo_articoli FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "ca_update" ON catalogo_articoli FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "ca_delete" ON catalogo_articoli FOR DELETE USING (organization_id = get_user_organization_id());

-- ── 9. catalogo_prezzi ──────────────────────────────────────
CREATE TABLE catalogo_prezzi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codice          TEXT NOT NULL,
  prezzo          NUMERIC(10,4),
  disponibile_al  BOOLEAN NOT NULL DEFAULT false,
  disponibile_ct  BOOLEAN NOT NULL DEFAULT false,
  qty_al          NUMERIC(10,3) NOT NULL DEFAULT 0,
  qty_ct          NUMERIC(10,3) NOT NULL DEFAULT 0,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, codice)
);

ALTER TABLE catalogo_prezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select" ON catalogo_prezzi FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "cp_insert" ON catalogo_prezzi FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "cp_update" ON catalogo_prezzi FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "cp_delete" ON catalogo_prezzi FOR DELETE USING (organization_id = get_user_organization_id());

-- ── 10. Repoint FK verso catalogo_articoli ──────────────────
ALTER TABLE varianti_prodotto
  ADD CONSTRAINT varianti_prodotto_prodotto_id_fkey
  FOREIGN KEY (prodotto_id) REFERENCES catalogo_articoli(id) ON DELETE CASCADE;

ALTER TABLE movimenti_magazzino
  ADD CONSTRAINT movimenti_magazzino_prodotto_id_fkey
  FOREIGN KEY (prodotto_id) REFERENCES catalogo_articoli(id) ON DELETE RESTRICT;

ALTER TABLE articoli_magazzino
  ADD CONSTRAINT articoli_magazzino_prodotto_id_fkey
  FOREIGN KEY (prodotto_id) REFERENCES catalogo_articoli(id) ON DELETE SET NULL;

-- ── 11. Ricrea policy varianti_prodotto su catalogo_articoli ─
CREATE POLICY "varianti_select" ON varianti_prodotto FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM catalogo_articoli ca
    WHERE ca.id = varianti_prodotto.prodotto_id
      AND ca.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_insert" ON varianti_prodotto FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM catalogo_articoli ca
    WHERE ca.id = varianti_prodotto.prodotto_id
      AND ca.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_update" ON varianti_prodotto FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM catalogo_articoli ca
    WHERE ca.id = varianti_prodotto.prodotto_id
      AND ca.organization_id = get_user_organization_id()
  ));
CREATE POLICY "varianti_delete" ON varianti_prodotto FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM catalogo_articoli ca
    WHERE ca.id = varianti_prodotto.prodotto_id
      AND ca.organization_id = get_user_organization_id()
  ));

-- ── 12. Ricrea vista giacenze ────────────────────────────────
CREATE VIEW giacenze WITH (security_invoker = true) AS
  SELECT
    p.organization_id,
    p.id            AS prodotto_id,
    p.codice,
    p.descrizione   AS prodotto_nome,
    p.um            AS unita_misura,
    v.id            AS variante_id,
    v.nome          AS variante_nome,
    COALESCE(
      SUM(CASE WHEN m.tipo = 'entrata' THEN m.quantita ELSE -m.quantita END),
      0
    ) AS giacenza_attuale
  FROM catalogo_articoli p
  LEFT JOIN varianti_prodotto v ON v.prodotto_id = p.id
  LEFT JOIN movimenti_magazzino m ON m.prodotto_id = p.id
    AND (m.variante_id = v.id OR (m.variante_id IS NULL AND v.id IS NULL))
  GROUP BY p.organization_id, p.id, p.codice, p.descrizione, p.um, v.id, v.nome;
