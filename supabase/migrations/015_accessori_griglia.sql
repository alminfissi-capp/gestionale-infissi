-- ============================================================
-- 015_accessori_griglia.sql
-- Accessori configurabili per listini a griglia
-- ============================================================

CREATE TABLE IF NOT EXISTS accessori_griglia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listino_id      UUID NOT NULL REFERENCES listini(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  gruppo          TEXT NOT NULL DEFAULT '',
  gruppo_tipo     TEXT NOT NULL DEFAULT 'multiplo'
    CHECK (gruppo_tipo IN ('multiplo', 'unico')),
  nome            TEXT NOT NULL,
  tipo_prezzo     TEXT NOT NULL DEFAULT 'pezzo'
    CHECK (tipo_prezzo IN ('pezzo', 'mq', 'percentuale')),
  prezzo          NUMERIC(10,2) NOT NULL DEFAULT 0,
  prezzo_acquisto NUMERIC(10,2) NOT NULL DEFAULT 0,
  mq_minimo       NUMERIC(10,4),
  ordine          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accessori_griglia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage accessori_griglia"
  ON accessori_griglia FOR ALL
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

-- Colonna per salvare gli accessori selezionati nell'articolo preventivo
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS accessori_griglia JSONB DEFAULT '[]'::jsonb;
