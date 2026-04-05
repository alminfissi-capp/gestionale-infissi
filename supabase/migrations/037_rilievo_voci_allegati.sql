-- Bucket storage per allegati rilievo
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rilievo-allegati',
  'rilievo-allegati',
  false,
  20971520,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS storage: solo i membri dell'org possono accedere ai propri file
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rilievo_allegati_insert'
  ) THEN
    CREATE POLICY "rilievo_allegati_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'rilievo-allegati' AND
      (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM profiles WHERE id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rilievo_allegati_select'
  ) THEN
    CREATE POLICY "rilievo_allegati_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'rilievo-allegati' AND
      (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM profiles WHERE id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rilievo_allegati_delete'
  ) THEN
    CREATE POLICY "rilievo_allegati_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'rilievo-allegati' AND
      (storage.foldername(name))[1] = (
        SELECT organization_id::text FROM profiles WHERE id = auth.uid()
      )
    );
  END IF;
END $$;

-- Tabella allegati per le voci rilievo
CREATE TABLE IF NOT EXISTS rilievo_voci_allegati (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voce_id       UUID NOT NULL REFERENCES rilievo_veloce_voci(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  nome_file     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  dimensione    BIGINT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rilievo_voci_allegati ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rilievo_voci_allegati_rls"
ON rilievo_voci_allegati
FOR ALL TO authenticated
USING (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
)
WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
);
