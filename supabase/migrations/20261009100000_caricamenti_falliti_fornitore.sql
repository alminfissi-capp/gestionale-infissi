-- ============================================================
-- 20261009100000_caricamenti_falliti_fornitore.sql
-- Tentativi di caricamento del fornitore (/o/[token]) non riusciti:
-- compaiono nel cruscotto Produzione finche' il fornitore non riesce
-- a caricare un file dello stesso tipo o qualcuno li segna risolti.
-- ============================================================

CREATE TABLE IF NOT EXISTS caricamenti_falliti_fornitore (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine_id       uuid NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('conferma', 'documento')),
  nome_file       text NOT NULL,
  -- Il messaggio che ha visto il fornitore
  errore          text NOT NULL,
  -- Perche' e' fallita la strada diretta su Storage (diagnostica)
  motivo          text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- 'caricamento': il fornitore poi ce l'ha fatta; 'utente': segnato a mano
  risolto_at      timestamptz,
  risolto_da      text CHECK (risolto_da IN ('caricamento', 'utente'))
);

CREATE INDEX IF NOT EXISTS idx_caricamenti_falliti_aperti
  ON caricamenti_falliti_fornitore(organization_id) WHERE risolto_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_caricamenti_falliti_ordine
  ON caricamenti_falliti_fornitore(ordine_id);

ALTER TABLE caricamenti_falliti_fornitore ENABLE ROW LEVEL SECURITY;

-- Le righe le scrive la pagina pubblica col service role; l'utente legge e
-- segna risolto.
CREATE POLICY "caricamenti_falliti_select" ON caricamenti_falliti_fornitore
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "caricamenti_falliti_update" ON caricamenti_falliti_fornitore
  FOR UPDATE USING (organization_id = get_user_organization_id());
