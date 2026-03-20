-- ============================================================
-- 027_cataloghi_bucket_public.sql
-- Rende pubblico il bucket cataloghi-brochure.
-- La migration 013 usa ON CONFLICT DO NOTHING, quindi se il bucket
-- esisteva già come privato non veniva aggiornato.
-- ============================================================

UPDATE storage.buckets
SET public = true
WHERE id = 'cataloghi-brochure';
