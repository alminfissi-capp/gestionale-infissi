-- ============================================================
-- 20261116100000_integrazioni.sql
-- Chiavi dei servizi esterni (openapi.it, Stripe) scritte in Impostazioni → Collegamenti.
-- Il valore sta nel Vault (cifrato), letto solo dal service role; la tabella `integrazioni` tiene solo
-- cosa e' salvato (ultime 4 cifre, data) per mostrarlo senza mai rileggere il segreto.
-- Stesso schema del token di Fatture in Cloud (20260928100000_fatture_in_cloud.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS integrazioni (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  servizio        text NOT NULL CHECK (servizio IN ('openapi', 'stripe')),
  campo           text NOT NULL,
  ultime4         text,
  aggiornato_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, servizio, campo)
);
ALTER TABLE integrazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integrazioni_select ON integrazioni;
CREATE POLICY integrazioni_select ON integrazioni FOR SELECT USING (organization_id = get_user_organization_id());

CREATE OR REPLACE FUNCTION public.integrazione_salva(p_org uuid, p_nome text, p_valore text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_nome text := 'integrazione_' || p_nome || '_' || p_org::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_nome;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_valore, v_nome, 'Chiave servizio WinStudio');
  ELSE
    PERFORM vault.update_secret(v_id, p_valore);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.integrazione_leggi(p_org uuid, p_nome text)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'integrazione_' || p_nome || '_' || p_org::text;
$$;

CREATE OR REPLACE FUNCTION public.integrazione_elimina(p_org uuid, p_nome text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'integrazione_' || p_nome || '_' || p_org::text;
$$;

REVOKE ALL ON FUNCTION public.integrazione_salva(uuid, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.integrazione_leggi(uuid, text)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.integrazione_elimina(uuid, text)     FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integrazione_salva(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.integrazione_leggi(uuid, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.integrazione_elimina(uuid, text)     TO service_role;
