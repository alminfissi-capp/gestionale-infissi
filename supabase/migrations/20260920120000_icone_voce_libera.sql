-- 20260920120000_icone_voce_libera.sql
-- Libreria di icone riusabili per le voci libere dei preventivi.
--
-- La voce libera ha gia' un'immagine (`articoli_preventivo.immagine_url`, URL
-- pubblico nel bucket `preventivi-allegati`): finora andava caricata ogni volta,
-- anche quando era la stessa foto di sempre. Questa tabella e' l'elenco delle
-- immagini gia' caricate una volta per tutte, da ripescare con un clic.
--
-- I file stanno nello stesso bucket pubblico, sotto `<organization_id>/icone/`:
-- le policy di storage esistenti guardano la prima cartella del path, quindi
-- valgono gia' cosi' come sono. Qui si salva il PATH e non l'URL: l'URL pubblico
-- si ricava dal path, e tenerli tutti e due vorrebbe dire tenerli d'accordo.

CREATE TABLE IF NOT EXISTS icone_preventivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS icone_preventivo_org_idx
  ON icone_preventivo (organization_id, ordine);

ALTER TABLE icone_preventivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "icone_preventivo_select" ON icone_preventivo;
DROP POLICY IF EXISTS "icone_preventivo_insert" ON icone_preventivo;
DROP POLICY IF EXISTS "icone_preventivo_update" ON icone_preventivo;
DROP POLICY IF EXISTS "icone_preventivo_delete" ON icone_preventivo;

CREATE POLICY "icone_preventivo_select" ON icone_preventivo
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE POLICY "icone_preventivo_insert" ON icone_preventivo
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "icone_preventivo_update" ON icone_preventivo
  FOR UPDATE USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "icone_preventivo_delete" ON icone_preventivo
  FOR DELETE USING (organization_id = get_user_organization_id());
