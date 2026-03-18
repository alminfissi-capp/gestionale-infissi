-- ============================================================
-- 026_allegati_calcoli.sql
-- PDF allegati al foglio dei calcoli interni (per preventivo)
-- ============================================================

CREATE TABLE allegati_calcoli (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  preventivo_id UUID NOT NULL REFERENCES preventivi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE allegati_calcoli ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage allegati_calcoli"
  ON allegati_calcoli
  FOR ALL
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

-- Bucket privato (solo utenti autenticati dell'org)
INSERT INTO storage.buckets (id, name, public)
VALUES ('allegati-calcoli', 'allegati-calcoli', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org members can upload allegati_calcoli"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'allegati-calcoli'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "org members can read allegati_calcoli"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'allegati-calcoli'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "org members can delete allegati_calcoli"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'allegati-calcoli'
    AND auth.uid() IS NOT NULL
  );
