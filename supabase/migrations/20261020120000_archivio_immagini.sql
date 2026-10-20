-- 20261020120000_archivio_immagini.sql
-- Archivio immagini per le voci libere dei preventivi, diviso in categorie (Grate,
-- Pergole...). Funziona come le icone, con una differenza voluta: scegliendo
-- un'immagine (o un'icona) il preventivo ne salva una COPIA in `preventivi-allegati`.
-- Il preventivo e' un documento ufficiale: niente di quello che si cambia o si
-- cancella nell'archivio deve toccarlo. Per questo qui eliminare un'immagine o una
-- categoria cancella davvero i file del bucket.
--
-- Bucket pubblico a parte: il PDF e la pagina /p/[token] non passano dal login, ma
-- leggono solo la copia del preventivo; l'archivio pubblico serve alle miniature.
-- Le policy guardano la prima cartella del path (l'organizzazione), come in
-- preventivi-allegati.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('archivio-immagini', 'archivio-immagini', true, 5242880, ARRAY['image/webp', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "read archivio-immagini" ON storage.objects;
DROP POLICY IF EXISTS "upload archivio-immagini" ON storage.objects;
DROP POLICY IF EXISTS "delete archivio-immagini" ON storage.objects;

CREATE POLICY "read archivio-immagini" ON storage.objects
  FOR SELECT USING (bucket_id = 'archivio-immagini');
CREATE POLICY "upload archivio-immagini" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'archivio-immagini'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "delete archivio-immagini" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'archivio-immagini'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM profiles WHERE id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS archivio_categorie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archivio_categorie_org_idx ON archivio_categorie (organization_id, ordine);

CREATE TABLE IF NOT EXISTS archivio_immagini (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES archivio_categorie(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archivio_immagini_cat_idx ON archivio_immagini (organization_id, categoria_id, ordine);

ALTER TABLE archivio_categorie ENABLE ROW LEVEL SECURITY;
ALTER TABLE archivio_immagini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archivio_categorie_select" ON archivio_categorie FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "archivio_categorie_insert" ON archivio_categorie FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "archivio_categorie_update" ON archivio_categorie FOR UPDATE USING (organization_id = get_user_organization_id()) WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "archivio_categorie_delete" ON archivio_categorie FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "archivio_immagini_select" ON archivio_immagini FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "archivio_immagini_insert" ON archivio_immagini FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "archivio_immagini_update" ON archivio_immagini FOR UPDATE USING (organization_id = get_user_organization_id()) WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "archivio_immagini_delete" ON archivio_immagini FOR DELETE USING (organization_id = get_user_organization_id());
