-- ============================================================
-- 20261003100000_fic_pagamenti.sql
-- Fatture in Cloud fase 2: collegamento scadenze ↔ fatture/note FiC.
-- Dato solo WinStudio: la sincronizzazione FiC non tocca questa tabella.
-- ============================================================

ALTER TABLE scadenze ADD COLUMN IF NOT EXISTS fic_metodo_id bigint;

CREATE TABLE scadenze_fatture (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL DEFAULT get_user_organization_id()
                                  REFERENCES organizations(id) ON DELETE CASCADE,
  -- RESTRICT: nessuna cancellazione (diretta o in cascata) puo' far sparire un
  -- collegamento senza passare dall'annullamento su FiC
  scadenza_id       uuid          NOT NULL REFERENCES scadenze(id) ON DELETE RESTRICT,
  fic_documento_id  bigint        NOT NULL,
  tipo_documento    text          NOT NULL CHECK (tipo_documento IN ('fattura', 'nota_credito')),
  importo           numeric(12,2) NOT NULL CHECK (importo > 0),
  stato_fic         text          NOT NULL DEFAULT 'non_scritto'
                                  CHECK (stato_fic IN ('non_scritto', 'scritto', 'da_allineare', 'da_verificare')),
  messaggio_fic     text,
  scrittura_fic     jsonb,
  scritto_at        timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (scadenza_id, fic_documento_id)
);

CREATE INDEX idx_scadenze_fatture_scadenza ON scadenze_fatture (scadenza_id);
CREATE INDEX idx_scadenze_fatture_documento ON scadenze_fatture (organization_id, fic_documento_id);
CREATE INDEX idx_scadenze_fatture_stato ON scadenze_fatture (organization_id, stato_fic);

ALTER TABLE scadenze_fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scadenze_fatture_org" ON scadenze_fatture
  FOR ALL USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
