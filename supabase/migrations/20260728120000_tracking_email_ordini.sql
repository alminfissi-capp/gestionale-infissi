-- ============================================================
-- 20260728120000_tracking_email_ordini.sql
-- Tracking invio e lettura degli ordini fornitore
-- ============================================================

ALTER TABLE ordini_fornitore
  ADD COLUMN IF NOT EXISTS tracking_token   UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS pdf_inviato_path TEXT;

COMMENT ON COLUMN ordini_fornitore.tracking_token IS
  'Token del link pubblico /o/[token]. Generato al primo invio, poi stabile.';
COMMENT ON COLUMN ordini_fornitore.pdf_inviato_path IS
  'Copia congelata del PDF al momento dell''invio, servita al fornitore.';

CREATE TABLE IF NOT EXISTS tracking_email_ordine (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine_id       UUID NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL
    CHECK (tipo IN ('inviato', 'email_aperta', 'pagina_aperta', 'pdf_scaricato')),
  avvenuto_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  destinatario    TEXT,
  user_agent      TEXT,
  ip              TEXT
);

CREATE INDEX IF NOT EXISTS idx_tracking_email_ordine_ordine
  ON tracking_email_ordine(ordine_id, avvenuto_at DESC);

ALTER TABLE tracking_email_ordine ENABLE ROW LEVEL SECURITY;

-- Sola lettura per l'organizzazione. Nessuna policy di scrittura: gli eventi
-- vengono inseriti esclusivamente lato server con il service role.
CREATE POLICY "tracking_email_ordine_select" ON tracking_email_ordine
  FOR SELECT USING (organization_id = get_user_organization_id());
