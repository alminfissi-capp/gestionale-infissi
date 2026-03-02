-- Discriminatore tipo
ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'listino'
    CHECK (tipo IN ('listino', 'libera'));

-- Rendi nullable i campi non applicabili alla voce libera
ALTER TABLE articoli_preventivo
  ALTER COLUMN larghezza_mm DROP NOT NULL,
  ALTER COLUMN altezza_mm DROP NOT NULL,
  ALTER COLUMN larghezza_listino_mm DROP NOT NULL,
  ALTER COLUMN altezza_listino_mm DROP NOT NULL,
  ALTER COLUMN prezzo_base DROP NOT NULL;

-- Bucket immagini preventivi (pubblico, 5MB, immagini)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('preventivi-allegati', 'preventivi-allegati', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- RLS bucket (stessa struttura di listini-immagini)
CREATE POLICY "upload preventivi-allegati" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'preventivi-allegati' AND
    (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid()));

CREATE POLICY "delete preventivi-allegati" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'preventivi-allegati' AND
    (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid()));

CREATE POLICY "read preventivi-allegati" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'preventivi-allegati');
