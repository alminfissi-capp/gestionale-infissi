-- ============================================================
-- 013_cataloghi.sql
-- Cataloghi e brochure PDF per organizzazione
-- ============================================================

-- Tabella cataloghi
CREATE TABLE cataloghi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cataloghi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage cataloghi"
  ON cataloghi
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

-- Bucket storage (pubblico per poter caricare le miniature via pdfjs e condividere con clienti)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cataloghi-brochure', 'cataloghi-brochure', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org members can upload cataloghi"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cataloghi-brochure'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "org members can delete cataloghi"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cataloghi-brochure'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "public read cataloghi"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cataloghi-brochure');
