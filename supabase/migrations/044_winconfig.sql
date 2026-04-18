-- ============================================================
-- Migration 044: Modulo WinConfig — Configuratore Serramento
-- ============================================================

-- wc_serie: catalogo serie di profili
CREATE TABLE IF NOT EXISTS wc_serie (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                text        NOT NULL,
  materiale           text        NOT NULL DEFAULT 'alluminio'
                                  CHECK (materiale IN ('alluminio','pvc','legno_alluminio')),
  descrizione         text,
  sfrido_nodo_mm      integer     NOT NULL DEFAULT 0,
  sfrido_angolo_mm    integer     NOT NULL DEFAULT 0,
  lunghezza_barra_mm  integer     NOT NULL DEFAULT 6000,
  attiva              boolean     NOT NULL DEFAULT true,
  ordine              integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- wc_profili: singoli profili/barre per serie
CREATE TABLE IF NOT EXISTS wc_profili (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id             uuid        NOT NULL REFERENCES wc_serie(id) ON DELETE CASCADE,
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codice               text        NOT NULL DEFAULT '',
  nome                 text        NOT NULL,
  tipo                 text        NOT NULL DEFAULT 'altro'
                                   CHECK (tipo IN ('telaio','anta','traversa','montante','fermavetro','coprifilo','altro')),
  peso_ml              numeric     NOT NULL DEFAULT 0,
  prezzo_ml            numeric     NOT NULL DEFAULT 0,
  prezzo_acquisto_ml   numeric     NOT NULL DEFAULT 0,
  ordine               integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- wc_accessori: accessori con regole quantità per range dimensionale
CREATE TABLE IF NOT EXISTS wc_accessori (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id             uuid        NOT NULL REFERENCES wc_serie(id) ON DELETE CASCADE,
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                 text        NOT NULL,
  codice               text        NOT NULL DEFAULT '',
  unita                text        NOT NULL DEFAULT 'pz'
                                   CHECK (unita IN ('pz','ml','coppia')),
  prezzo               numeric     NOT NULL DEFAULT 0,
  prezzo_acquisto      numeric     NOT NULL DEFAULT 0,
  -- [{"larghezza_max":1500,"altezza_max":2400,"qty":2}, ...]
  regole_qty           jsonb       NOT NULL DEFAULT '[]',
  qty_fissa            numeric,
  ordine               integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- wc_riempimenti: vetri, pannelli, persiane
CREATE TABLE IF NOT EXISTS wc_riempimenti (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serie_id             uuid        REFERENCES wc_serie(id) ON DELETE SET NULL,
  nome                 text        NOT NULL,
  tipo                 text        NOT NULL DEFAULT 'vetro'
                                   CHECK (tipo IN ('vetro','pannello','persiana','altro')),
  spessore_mm          integer,
  prezzo_mq            numeric     NOT NULL DEFAULT 0,
  prezzo_acquisto_mq   numeric     NOT NULL DEFAULT 0,
  mq_minimo            numeric     NOT NULL DEFAULT 0,
  ordine               integer     NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- wc_colori: colori per serie con sovrapprezzo
CREATE TABLE IF NOT EXISTS wc_colori (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id                uuid        NOT NULL REFERENCES wc_serie(id) ON DELETE CASCADE,
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome                    text        NOT NULL,
  codice_ral              text,
  tipo_sovrapprezzo       text        NOT NULL DEFAULT 'percentuale'
                                      CHECK (tipo_sovrapprezzo IN ('percentuale','mq','fisso')),
  valore_sovrapprezzo     numeric     NOT NULL DEFAULT 0,
  bicolore_disponibile    boolean     NOT NULL DEFAULT false,
  ordine                  integer     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS wc_serie_org_idx       ON wc_serie(organization_id);
CREATE INDEX IF NOT EXISTS wc_profili_serie_idx   ON wc_profili(serie_id);
CREATE INDEX IF NOT EXISTS wc_accessori_serie_idx ON wc_accessori(serie_id);
CREATE INDEX IF NOT EXISTS wc_riempimenti_org_idx ON wc_riempimenti(organization_id);
CREATE INDEX IF NOT EXISTS wc_colori_serie_idx    ON wc_colori(serie_id);

-- RLS
ALTER TABLE wc_serie       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc_profili     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc_accessori   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc_riempimenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE wc_colori      ENABLE ROW LEVEL SECURITY;

-- Policies wc_serie
CREATE POLICY "org_select" ON wc_serie FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_insert" ON wc_serie FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_update" ON wc_serie FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_delete" ON wc_serie FOR DELETE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies wc_profili
CREATE POLICY "org_select" ON wc_profili FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_insert" ON wc_profili FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_update" ON wc_profili FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_delete" ON wc_profili FOR DELETE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies wc_accessori
CREATE POLICY "org_select" ON wc_accessori FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_insert" ON wc_accessori FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_update" ON wc_accessori FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_delete" ON wc_accessori FOR DELETE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies wc_riempimenti
CREATE POLICY "org_select" ON wc_riempimenti FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_insert" ON wc_riempimenti FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_update" ON wc_riempimenti FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_delete" ON wc_riempimenti FOR DELETE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Policies wc_colori
CREATE POLICY "org_select" ON wc_colori FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_insert" ON wc_colori FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_update" ON wc_colori FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "org_delete" ON wc_colori FOR DELETE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Estendi articoli_preventivo
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS config_winconfig jsonb;

ALTER TABLE articoli_preventivo
  DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;

ALTER TABLE articoli_preventivo
  ADD CONSTRAINT articoli_preventivo_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'listino','libera','listino_libero','scorrevole','su_misura','winconfig'
  ]));
