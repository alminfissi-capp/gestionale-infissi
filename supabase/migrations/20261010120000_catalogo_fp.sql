-- ============================================================
-- 20261010120000_catalogo_fp.sql
-- Catalogo FP PRO (fase 1 del progetto rilievo -> preventivo -> FP PRO).
-- Le tabelle fp_* sono una COPIA del MySQL di FP PRO (archivio EDILSIDER):
-- le scrive solo il ponte sul PC col service role, gli utenti le leggono.
-- fp_id = chiave della riga in FP PRO; presente = false quando la riga
-- non c'e' piu' in FP PRO (non si cancella: rilievi e preventivi futuri
-- potrebbero puntarci); dati = riga originale senza i campi vuoti.
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_serie (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  nome             text NOT NULL,
  descrizione      text,
  visibile         boolean NOT NULL DEFAULT true,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

CREATE TABLE IF NOT EXISTS fp_profili (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id                 integer NOT NULL,
  serie_fp_id           integer,
  codice                text NOT NULL,
  descrizione           text,
  kg_ml                 numeric,
  larghezza             numeric,
  costo_kg              numeric,
  costo_ml              numeric,
  var_listino           numeric,
  tolleranza_estrusione numeric,
  file_dxf              text,
  presente              boolean NOT NULL DEFAULT true,
  sincronizzato_at      timestamptz NOT NULL DEFAULT now(),
  dati                  jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- Prezzo del profilo per finitura (colore): e' qui che sta il prezzo vero.
CREATE TABLE IF NOT EXISTS fp_profili_costi (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  profilo_fp_id    integer NOT NULL,
  colore_fp_id     integer,
  codice_trattato  text,
  costo_kg         numeric,
  costo_ml         numeric,
  var_listino      numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_profili_costi_profilo ON fp_profili_costi(organization_id, profilo_fp_id);

-- Finiture: in FP PRO sono i "trattamenti superficiali".
CREATE TABLE IF NOT EXISTS fp_colori (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  descrizione      text NOT NULL,
  tipo             integer,
  costo_kg         numeric,
  costo_ml         numeric,
  costo_mq         numeric,
  per_profili      boolean NOT NULL DEFAULT false,
  per_accessori    boolean NOT NULL DEFAULT false,
  per_vetri        boolean NOT NULL DEFAULT false,
  rgb              text,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- prezzo = prezzo per "unita_vendita" pezzi (es. 432 EUR ogni 400 pezzi).
CREATE TABLE IF NOT EXISTS fp_accessori (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  serie            text,
  codice           text NOT NULL,
  descrizione      text,
  prezzo           numeric,
  unita_vendita    numeric,
  confezione       numeric,
  min_fatt         numeric,
  var_listino      numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_accessori_codice ON fp_accessori(organization_id, codice);

CREATE TABLE IF NOT EXISTS fp_accessori_costi (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id             integer NOT NULL,
  accessorio_fp_id  integer NOT NULL,
  colore_fp_id      integer,
  codice_trattato   text,
  prezzo            numeric,
  costo_unitario    numeric,
  unita_vendita     numeric,
  var_listino       numeric,
  presente          boolean NOT NULL DEFAULT true,
  sincronizzato_at  timestamptz NOT NULL DEFAULT now(),
  dati              jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_accessori_costi_acc ON fp_accessori_costi(organization_id, accessorio_fp_id);

CREATE TABLE IF NOT EXISTS fp_vetri (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  codice           text NOT NULL,
  descrizione      text,
  prezzo_mq        numeric,
  min_fatt         numeric,
  spessore         numeric,
  kg_mq            numeric,
  var_listino      numeric,
  isolante         boolean NOT NULL DEFAULT false,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

CREATE TABLE IF NOT EXISTS fp_kit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  nome             text NOT NULL,
  descrizione      text,
  gruppo_fp_id     integer,
  opzionale        boolean NOT NULL DEFAULT false,
  predefinito      boolean NOT NULL DEFAULT false,
  numero_ante      integer,
  l_min            numeric,
  l_max            numeric,
  h_min            numeric,
  h_max            numeric,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);

-- Righe dei kit con le regole di quantita' (fisse, a fasce, a passo, a formula).
CREATE TABLE IF NOT EXISTS fp_kit_righe (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  kit_fp_id        integer NOT NULL,
  tipo             integer,
  codice           text,
  descrizione      text,
  quantita         numeric,
  opzionale        boolean NOT NULL DEFAULT false,
  dim_rif          integer,
  lim_inf          numeric,
  lim_sup          numeric,
  passo            numeric,
  formula_l        text,
  formula_h        text,
  formula_r        text,
  formula_dist     text,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS idx_fp_kit_righe_kit ON fp_kit_righe(organization_id, kit_fp_id);

-- Richieste da WinStudio al ponte.
CREATE TABLE IF NOT EXISTS fp_ponte_richieste (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('sincronizza')),
  stato           text NOT NULL DEFAULT 'in_attesa'
                  CHECK (stato IN ('in_attesa', 'in_corso', 'completata', 'errore')),
  automatica      boolean NOT NULL DEFAULT false,
  richiesta_da    uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  iniziata_at     timestamptz,
  finita_at       timestamptz,
  esito           jsonb,
  errore          text
);
-- Al massimo UNA richiesta aperta per organizzazione: due clic = una richiesta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_ponte_richieste_aperta
  ON fp_ponte_richieste(organization_id) WHERE stato IN ('in_attesa', 'in_corso');
CREATE INDEX IF NOT EXISTS idx_fp_ponte_richieste_recenti
  ON fp_ponte_richieste(organization_id, created_at DESC);

-- Una riga per organizzazione: segnale di vita e ultima sincronizzazione.
CREATE TABLE IF NOT EXISTS fp_ponte_stato (
  organization_id    uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  ultimo_segnale_at  timestamptz,
  versione           text,
  ultima_sync_at     timestamptz,
  ultima_sync_esito  jsonb,
  -- Giorno (Europe/Rome, 'YYYY-MM-DD') in cui e' stata accodata l'ultima
  -- sync automatica: evita di riprovare ogni 30 s se fallisce.
  ultimo_giorno_auto text
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_serie','fp_profili','fp_profili_costi','fp_colori','fp_accessori',
                           'fp_accessori_costi','fp_vetri','fp_kit','fp_kit_righe','fp_ponte_stato']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (organization_id = get_user_organization_id())',
                   t || '_select', t);
  END LOOP;
END $$;

ALTER TABLE fp_ponte_richieste ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_ponte_richieste_select" ON fp_ponte_richieste
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fp_ponte_richieste_insert" ON fp_ponte_richieste
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id() AND tipo = 'sincronizza');
