-- ============================================================
-- 006_listini_immagini.sql
-- Bucket pubblico per immagini prodotto dei listini
-- + colonna immagine_url su listini e articoli_preventivo
-- ============================================================

-- Colonna immagine sul listino (nullable, URL pubblico)
ALTER TABLE listini
  ADD COLUMN IF NOT EXISTS immagine_url TEXT DEFAULT NULL;

-- Snapshot immagine sull'articolo del preventivo (per la stampa)
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS immagine_url TEXT DEFAULT NULL;

-- Bucket pubblico: le immagini vengono mostrate tramite URL diretto
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listini-immagini',
  'listini-immagini',
  true,
  2097152,  -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Nessuna policy SELECT: il bucket è pubblico

-- Insert: solo nella propria cartella (orgId/filename)
CREATE POLICY "listini_immagini_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'listini-immagini' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "listini_immagini_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'listini-immagini' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "listini_immagini_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'listini-immagini' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
