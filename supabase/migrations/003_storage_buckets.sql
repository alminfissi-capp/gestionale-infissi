-- ============================================================
-- 003_storage_buckets.sql
-- Configurazione Supabase Storage buckets
-- ============================================================

-- Bucket per i loghi aziendali
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  false,
  2097152,  -- 2MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
);

-- Bucket per le immagini prodotti
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  false,
  5242880,  -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
);

-- RLS per bucket logos
CREATE POLICY "logos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "logos_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "logos_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'logos' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "logos_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'logos' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

-- RLS per bucket product-images
CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'product-images' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
