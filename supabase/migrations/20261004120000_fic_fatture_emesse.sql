-- ============================================================
-- 20261004120000_fic_fatture_emesse.sql
-- Fatture in Cloud fase 4: copia delle fatture emesse, collegamento alle commesse
-- (con quota) e agli incassi (acconti_commessa), con scrittura dei pagamenti su FiC.
-- Le copie FiC si riscrivono a ogni sincronizzazione; i collegamenti sono dati solo
-- WinStudio, in tabelle separate.
-- ============================================================

CREATE TABLE fatture_emesse (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid          NOT NULL DEFAULT get_user_organization_id()
                                   REFERENCES organizations(id) ON DELETE CASCADE,
  fic_id             bigint        NOT NULL,
  tipo               text          NOT NULL CHECK (tipo IN ('fattura', 'nota_credito')),
  numero             text,
  data               date          NOT NULL,
  cliente_fic_id     bigint,
  cliente_nome       text          NOT NULL,
  cliente_piva       text,
  importo_netto      numeric(12,2) NOT NULL,
  importo_iva        numeric(12,2) NOT NULL,
  ritenuta           numeric(12,2) NOT NULL DEFAULT 0,
  importo_lordo      numeric(12,2) NOT NULL,
  prossima_scadenza  date,
  elettronica        boolean       NOT NULL DEFAULT false,
  fic_updated_at     text          NOT NULL,
  fic_dati           jsonb         NOT NULL,
  sincronizzata_at   timestamptz   NOT NULL,
  UNIQUE (organization_id, fic_id)
);
CREATE INDEX idx_fatture_emesse_org_data ON fatture_emesse (organization_id, data);
CREATE INDEX idx_fatture_emesse_org_cliente ON fatture_emesse (organization_id, cliente_nome);
ALTER TABLE fatture_emesse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_emesse_select" ON fatture_emesse
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE TABLE fatture_emesse_rate (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT get_user_organization_id()
                                 REFERENCES organizations(id) ON DELETE CASCADE,
  fattura_id       uuid          NOT NULL REFERENCES fatture_emesse(id) ON DELETE CASCADE,
  fic_id           bigint,
  importo          numeric(12,2) NOT NULL,
  scadenza         date,
  stato            text          NOT NULL CHECK (stato IN ('pagata', 'da_pagare')),
  pagata_il        date,
  conto_fic_id     bigint,
  conto_nome       text,
  ordine           int           NOT NULL DEFAULT 0
);
CREATE INDEX idx_fatture_emesse_rate_fattura ON fatture_emesse_rate (fattura_id);
ALTER TABLE fatture_emesse_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_emesse_rate_select" ON fatture_emesse_rate
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Quale fattura va su quale commessa, e per quanto (una fattura puo' dividersi).
CREATE TABLE commesse_fatture (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL DEFAULT get_user_organization_id()
                                  REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id       uuid          NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  fic_documento_id  bigint        NOT NULL,
  tipo_documento    text          NOT NULL CHECK (tipo_documento IN ('fattura', 'nota_credito')),
  quota             numeric(12,2) NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (commessa_id, fic_documento_id)
);
CREATE INDEX idx_commesse_fatture_documento ON commesse_fatture (organization_id, fic_documento_id);
ALTER TABLE commesse_fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commesse_fatture_select" ON commesse_fatture
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Quale incasso paga quale fattura su FiC. Stessi stati e note di scrittura della fase 2.
CREATE TABLE incassi_fatture (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL DEFAULT get_user_organization_id()
                                  REFERENCES organizations(id) ON DELETE CASCADE,
  -- RESTRICT: un incasso non sparisce senza prima togliere da FiC cio' che vi e' stato scritto
  acconto_id        uuid          NOT NULL REFERENCES acconti_commessa(id) ON DELETE RESTRICT,
  fic_documento_id  bigint        NOT NULL,
  tipo_documento    text          NOT NULL CHECK (tipo_documento IN ('fattura', 'nota_credito')),
  importo           numeric(12,2) NOT NULL CHECK (importo > 0),
  stato_fic         text          NOT NULL DEFAULT 'non_scritto'
                                  CHECK (stato_fic IN ('non_scritto', 'scritto', 'da_allineare', 'da_verificare', 'in_corso')),
  messaggio_fic     text,
  scrittura_fic     jsonb,
  intenzione_fic    jsonb,
  scritto_at        timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (acconto_id, fic_documento_id)
);
CREATE INDEX idx_incassi_fatture_documento ON incassi_fatture (organization_id, fic_documento_id);
CREATE INDEX idx_incassi_fatture_stato ON incassi_fatture (organization_id, stato_fic);
ALTER TABLE incassi_fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incassi_fatture_select" ON incassi_fatture
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Sincronizzazione delle fatture emesse (indipendente da quella dei fornitori) e
-- abbinamento metodo d'incasso WinStudio -> conto di pagamento FiC.
ALTER TABLE fic_collegamenti
  ADD COLUMN IF NOT EXISTS emesse_sincronizza_dal date,
  ADD COLUMN IF NOT EXISTS emesse_sync_in_corso_da timestamptz,
  ADD COLUMN IF NOT EXISTS emesse_ultima_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS emesse_ultimo_esito text CHECK (emesse_ultimo_esito IN ('ok', 'parziale', 'errore')),
  ADD COLUMN IF NOT EXISTS emesse_ultimo_esito_at timestamptz,
  ADD COLUMN IF NOT EXISTS emesse_ultimo_messaggio text,
  ADD COLUMN IF NOT EXISTS emesse_ultimi_conteggi jsonb,
  ADD COLUMN IF NOT EXISTS metodi_incasso jsonb;
