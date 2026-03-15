-- ============================================================
-- 024_forme_serramento_v2.sql
-- Rimpiazza le tabelle 023 con un'unica tabella JSONB
-- che memorizza la geometria disegnata dall'utente
-- ============================================================

-- Rimuovi tabelle precedenti (cascata rimuove misure_forma e angoli_forma)
DROP TABLE IF EXISTS misure_forma CASCADE;
DROP TABLE IF EXISTS angoli_forma CASCADE;
DROP TABLE IF EXISTS forme_serramento CASCADE;

-- Nuova tabella con shape JSONB
-- shape = {
--   punti:    [{ id, gx, gy }]
--   segmenti: [{ id, fromId, toId, tipo:'retta'|'curva',
--               cpDx, cpDy,
--               misuraNome, misuraTipo:'input'|'calcolato', misuraFormula }]
--   angoliConfig: [{ puntoId, tipo:'fisso'|'automatico', gradi }]
--   chiusa: boolean
-- }
CREATE TABLE forme_serramento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  nome            TEXT NOT NULL,
  attiva          BOOLEAN NOT NULL DEFAULT true,
  ordine          INTEGER NOT NULL DEFAULT 0,
  shape           JSONB NOT NULL DEFAULT '{"punti":[],"segmenti":[],"angoliConfig":[],"chiusa":false}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE forme_serramento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage forme_serramento"
  ON forme_serramento FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX idx_forme_serramento_org ON forme_serramento(organization_id);
