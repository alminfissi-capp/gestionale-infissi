-- ============================================================
-- 023_forme_serramento.sql
-- Sistema forme serramento configurabile per rilievo misure
-- ============================================================

-- Forme serramento (configurabili per organizzazione)
CREATE TABLE IF NOT EXISTS forme_serramento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  nome            TEXT NOT NULL,
  svg_template    TEXT NOT NULL DEFAULT 'rettangolo',
  attiva          BOOLEAN NOT NULL DEFAULT true,
  ordine          INTEGER NOT NULL DEFAULT 0,
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

-- Misure della forma (lati/dimensioni)
CREATE TABLE IF NOT EXISTS misure_forma (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forma_id    UUID NOT NULL REFERENCES forme_serramento(id) ON DELETE CASCADE,
  codice      TEXT NOT NULL,           -- es. 'L', 'H', 'A', 'B'
  nome        TEXT NOT NULL,           -- es. 'Larghezza', 'Altezza', 'Freccia'
  tipo        TEXT NOT NULL DEFAULT 'input'
    CHECK (tipo IN ('input', 'calcolato')),
  formula     TEXT,                    -- es. 'L * H / 2' (solo se tipo=calcolato)
  unita       TEXT NOT NULL DEFAULT 'mm',
  ordine      INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE misure_forma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage misure_forma"
  ON misure_forma FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM forme_serramento f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE f.id = misure_forma.forma_id AND p.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forme_serramento f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE f.id = misure_forma.forma_id AND p.id = auth.uid()
    )
  );

-- Angoli della forma
CREATE TABLE IF NOT EXISTS angoli_forma (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forma_id    UUID NOT NULL REFERENCES forme_serramento(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,           -- es. 'Angolo base sinistra'
  tipo        TEXT NOT NULL DEFAULT 'fisso'
    CHECK (tipo IN ('fisso', 'libero')),
  gradi       NUMERIC(6,2),            -- solo se tipo=fisso (es. 90)
  ordine      INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE angoli_forma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage angoli_forma"
  ON angoli_forma FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM forme_serramento f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE f.id = angoli_forma.forma_id AND p.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forme_serramento f
      JOIN profiles p ON p.organization_id = f.organization_id
      WHERE f.id = angoli_forma.forma_id AND p.id = auth.uid()
    )
  );

-- Indici
CREATE INDEX IF NOT EXISTS idx_forme_serramento_org ON forme_serramento(organization_id);
CREATE INDEX IF NOT EXISTS idx_misure_forma_forma ON misure_forma(forma_id);
CREATE INDEX IF NOT EXISTS idx_angoli_forma_forma ON angoli_forma(forma_id);
