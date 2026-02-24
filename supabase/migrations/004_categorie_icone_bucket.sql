-- ============================================================
-- 004_categorie_icone_bucket.sql
-- Bucket pubblico per icone personalizzate delle categorie
-- ============================================================

-- Bucket pubblico: le icone vengono mostrate a tutti gli utenti autenticati
-- tramite URL diretto senza necessità di signed URL
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'categorie-icone',
  'categorie-icone',
  true,
  1048576,  -- 1MB (ampiamente sufficiente per 128×128 WebP)
  ARRAY['image/webp']
);

-- Nessuna policy SELECT: il bucket è pubblico

-- Insert: solo nella propria cartella (orgId/filename.webp)
CREATE POLICY "categorie_icone_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'categorie-icone' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "categorie_icone_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'categorie-icone' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "categorie_icone_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'categorie-icone' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
