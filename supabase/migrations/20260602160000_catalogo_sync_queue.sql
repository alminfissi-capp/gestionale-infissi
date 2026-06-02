-- Coda di sincronizzazione prezzi ESP — persistente e condivisa tra utenti dell'org.
-- Un job = insieme di articoli da scansionare. Lo stato vive nel DB così sopravvive
-- al reload della pagina ed è visibile a chiunque entri con un'utenza della stessa org.

-- ─── Coda articoli ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_sync_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codice          text NOT NULL,
  reparto         int,
  status          text NOT NULL DEFAULT 'pending', -- pending|processing|done|no_price|not_found|error|timeout
  prezzo          numeric,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_org_status
  ON catalogo_sync_queue (organization_id, status);

-- ─── Stato globale per org (lock + heartbeat del processore) ──────────────────
CREATE TABLE IF NOT EXISTS catalogo_sync_state (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        text,                          -- id del tab/client che sta processando
  heartbeat       timestamptz,                   -- aggiornato ~ogni 5s dal processore attivo
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE catalogo_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csq_select" ON catalogo_sync_queue FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "csq_insert" ON catalogo_sync_queue FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "csq_update" ON catalogo_sync_queue FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "csq_delete" ON catalogo_sync_queue FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "css_select" ON catalogo_sync_state FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "css_insert" ON catalogo_sync_state FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "css_update" ON catalogo_sync_state FOR UPDATE USING (organization_id = get_user_organization_id());

-- ─── Realtime ────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE catalogo_sync_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE catalogo_sync_state;
