-- ============================================================
-- 20260928100000_fatture_in_cloud.sql
-- Collegamento a Fatture in Cloud (fase 1): token nel Vault,
-- copia locale delle spese FiC e delle loro rate.
-- FiC comanda: queste tabelle si riscrivono a ogni sincronizzazione.
-- Dati solo-WinStudio (commessa, note) vanno in tabelle separate.
-- ============================================================

-- ---- collegamento: una riga per organizzazione ----
CREATE TABLE fic_collegamenti (
  organization_id   uuid        PRIMARY KEY DEFAULT get_user_organization_id()
                                REFERENCES organizations(id) ON DELETE CASCADE,
  vault_secret_id   uuid,
  token_finale      text        NOT NULL DEFAULT '',
  fic_company_id    bigint      NOT NULL,
  fic_company_nome  text        NOT NULL,
  sincronizza_dal   date        NOT NULL,
  stato             text        NOT NULL DEFAULT 'attivo'
                                CHECK (stato IN ('attivo', 'da_ricollegare')),
  sync_in_corso_da  timestamptz,
  ultima_sync_at    timestamptz,
  ultimo_esito      text        CHECK (ultimo_esito IN ('ok', 'parziale', 'errore')),
  ultimo_esito_at   timestamptz,
  ultimo_messaggio  text,
  ultimi_conteggi   jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fic_collegamenti ENABLE ROW LEVEL SECURITY;
-- Solo lettura: stato e ultima sincronizzazione per la UI.
-- Le scritture passano dal service role nelle Server Action.
CREATE POLICY "fic_collegamenti_select" ON fic_collegamenti
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- spese FiC ----
CREATE TABLE fatture_fornitori (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid          NOT NULL DEFAULT get_user_organization_id()
                                   REFERENCES organizations(id) ON DELETE CASCADE,
  fic_id             bigint        NOT NULL,
  tipo               text          NOT NULL CHECK (tipo IN ('fattura', 'nota_credito')),
  numero             text,
  data               date          NOT NULL,
  descrizione        text,
  categoria          text,
  elettronica        boolean       NOT NULL DEFAULT false,
  fornitore_fic_id   bigint,
  fornitore_nome     text          NOT NULL,
  fornitore_piva     text,
  importo_netto      numeric(12,2) NOT NULL,
  importo_iva        numeric(12,2) NOT NULL,
  ritenuta           numeric(12,2) NOT NULL DEFAULT 0,
  altra_ritenuta     numeric(12,2) NOT NULL DEFAULT 0,
  importo_lordo      numeric(12,2) NOT NULL,
  prossima_scadenza  date,
  ha_allegato        boolean       NOT NULL DEFAULT false,
  -- stringa grezza di FiC ("YYYY-MM-DD HH:MM:SS", senza fuso): si confronta cosi' com'e'
  fic_updated_at     text          NOT NULL,
  fic_dati           jsonb         NOT NULL,
  sincronizzata_at   timestamptz   NOT NULL,
  UNIQUE (organization_id, fic_id)
);

CREATE INDEX idx_fatture_fornitori_org_data ON fatture_fornitori (organization_id, data);
CREATE INDEX idx_fatture_fornitori_org_fornitore ON fatture_fornitori (organization_id, fornitore_nome);

ALTER TABLE fatture_fornitori ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_fornitori_select" ON fatture_fornitori
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- rate ----
CREATE TABLE fatture_fornitori_rate (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT get_user_organization_id()
                                 REFERENCES organizations(id) ON DELETE CASCADE,
  fattura_id       uuid          NOT NULL REFERENCES fatture_fornitori(id) ON DELETE CASCADE,
  fic_id           bigint,
  importo          numeric(12,2) NOT NULL,
  scadenza         date,
  stato            text          NOT NULL CHECK (stato IN ('pagata', 'da_pagare')),
  pagata_il        date,
  conto_fic_id     bigint,
  conto_nome       text,
  ordine           int           NOT NULL DEFAULT 0
);

CREATE INDEX idx_fatture_fornitori_rate_fattura ON fatture_fornitori_rate (fattura_id);

ALTER TABLE fatture_fornitori_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fatture_fornitori_rate_select" ON fatture_fornitori_rate
  FOR SELECT USING (organization_id = get_user_organization_id());

-- ---- token nel Vault: solo service role ----
CREATE OR REPLACE FUNCTION public.fic_salva_token(p_org uuid, p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_nome text := 'fic_token_' || p_org::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_token, v_nome, 'Token Fatture in Cloud');
  ELSE
    PERFORM vault.update_secret(v_id, p_token);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fic_leggi_token(p_org uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'fic_token_' || p_org::text;
$$;

CREATE OR REPLACE FUNCTION public.fic_elimina_token(p_org uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'fic_token_' || p_org::text;
$$;

REVOKE ALL ON FUNCTION public.fic_salva_token(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fic_leggi_token(uuid)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fic_elimina_token(uuid)     FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fic_salva_token(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fic_leggi_token(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.fic_elimina_token(uuid)     TO service_role;

-- ---- nuovo modulo permesso ----
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo = ANY (ARRAY[
    'dashboard',
    'calendario',
    'preventivi',
    'clienti',
    'listini',
    'cataloghi',
    'rilievo',
    'winconfig',
    'magazzino',
    'commesse',
    'dipendenti',
    'produzione',
    'fatture_fornitori',
    'impostazioni'
  ]::text[]));
