-- ============================================================
-- 001_initial_schema.sql
-- Schema completo gestionale infissi A.L.M.
-- ============================================================

-- Tabella organizations
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella profiles (collegata a auth.users)
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT,
  role            TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella settings (una riga per organizzazione)
CREATE TABLE settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  denominazione   TEXT,
  indirizzo       TEXT,
  piva            TEXT,
  codice_fiscale  TEXT,
  telefono        TEXT,
  email           TEXT,
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella note_templates
CREATE TABLE note_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  testo           TEXT NOT NULL,
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella clienti
CREATE TABLE clienti (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT,
  cognome         TEXT,
  telefono        TEXT,
  email           TEXT,
  indirizzo       TEXT,
  cantiere        TEXT,
  cf_piva         TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT clienti_nome_or_cognome CHECK (
    (nome IS NOT NULL AND nome <> '') OR
    (cognome IS NOT NULL AND cognome <> '')
  )
);

CREATE INDEX idx_clienti_org ON clienti(organization_id);
CREATE INDEX idx_clienti_search ON clienti USING gin(
  to_tsvector('italian', coalesce(nome,'') || ' ' || coalesce(cognome,'') || ' ' || coalesce(cf_piva,''))
);

-- Tabella categorie_listini
CREATE TABLE categorie_listini (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  icona           TEXT NOT NULL DEFAULT '📂',
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categorie_org ON categorie_listini(organization_id);

-- Tabella listini
CREATE TABLE listini (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id    UUID NOT NULL REFERENCES categorie_listini(id) ON DELETE CASCADE,
  tipologia       TEXT NOT NULL,
  larghezze       INTEGER[] NOT NULL DEFAULT '{}',
  altezze         INTEGER[] NOT NULL DEFAULT '{}',
  griglia         JSONB NOT NULL DEFAULT '{}',
  immagine_url    TEXT,
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(categoria_id, tipologia)
);

CREATE INDEX idx_listini_org ON listini(organization_id);
CREATE INDEX idx_listini_categoria ON listini(categoria_id);
CREATE INDEX idx_listini_griglia ON listini USING gin(griglia);

-- Tabella finiture
CREATE TABLE finiture (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listino_id  UUID NOT NULL REFERENCES listini(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  aumento     NUMERIC(5,2) NOT NULL DEFAULT 0,
  ordine      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finiture_listino ON finiture(listino_id);

-- Tabella preventivi
CREATE TABLE preventivi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cliente_id      UUID REFERENCES clienti(id) ON DELETE SET NULL,
  numero          TEXT,
  cliente_snapshot JSONB NOT NULL DEFAULT '{}',
  sconto_globale  NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (sconto_globale BETWEEN 0 AND 60),
  note            TEXT,
  subtotale       NUMERIC(12,2) NOT NULL DEFAULT 0,
  importo_sconto  NUMERIC(12,2) NOT NULL DEFAULT 0,
  totale_articoli NUMERIC(12,2) NOT NULL DEFAULT 0,
  spese_trasporto NUMERIC(12,2) NOT NULL DEFAULT 0,
  totale_finale   NUMERIC(12,2) NOT NULL DEFAULT 0,
  totale_pezzi    INTEGER NOT NULL DEFAULT 0,
  stato           TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_preventivi_org ON preventivi(organization_id);
CREATE INDEX idx_preventivi_cliente ON preventivi(cliente_id);
CREATE INDEX idx_preventivi_created ON preventivi(created_at DESC);
CREATE INDEX idx_preventivi_numero ON preventivi(organization_id, numero) WHERE numero IS NOT NULL;

-- Tabella articoli_preventivo
CREATE TABLE articoli_preventivo (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preventivo_id         UUID NOT NULL REFERENCES preventivi(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listino_id            UUID REFERENCES listini(id) ON DELETE SET NULL,
  tipologia             TEXT NOT NULL,
  categoria_nome        TEXT,
  larghezza_mm          INTEGER NOT NULL,
  altezza_mm            INTEGER NOT NULL,
  larghezza_listino_mm  INTEGER NOT NULL,
  altezza_listino_mm    INTEGER NOT NULL,
  misura_arrotondata    BOOLEAN NOT NULL DEFAULT false,
  finitura_nome         TEXT,
  finitura_aumento      NUMERIC(5,2) NOT NULL DEFAULT 0,
  quantita              INTEGER NOT NULL DEFAULT 1 CHECK (quantita > 0),
  prezzo_base           NUMERIC(10,2) NOT NULL,
  prezzo_unitario       NUMERIC(10,2) NOT NULL,
  sconto_articolo       NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (sconto_articolo BETWEEN 0 AND 50),
  prezzo_totale_riga    NUMERIC(12,2) NOT NULL,
  ordine                INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_articoli_preventivo ON articoli_preventivo(preventivo_id);
CREATE INDEX idx_articoli_org ON articoli_preventivo(organization_id);
