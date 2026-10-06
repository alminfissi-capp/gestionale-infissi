-- ============================================================
-- 20261006120000_conferme_ordine_fornitore.sql
-- Conferme d'ordine e documenti caricati dal fornitore dal link
-- dell'ordine (/o/[token]), firma della conferma dal gestionale.
-- ============================================================

-- Il fornitore che vuole la conferma firmata: pre-imposta l'interruttore
-- sui nuovi ordini. La scelta che conta e' quella sull'ordine.
ALTER TABLE fornitori
  ADD COLUMN IF NOT EXISTS richiede_conferma boolean NOT NULL DEFAULT false;

ALTER TABLE ordini_fornitore
  ADD COLUMN IF NOT EXISTS richiede_conferma boolean NOT NULL DEFAULT false;

-- Timbro e firma aziendali applicati alle conferme (data URL PNG/JPEG,
-- come settings.firma_default).
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS timbro_conferme text,
  ADD COLUMN IF NOT EXISTS firma_conferme  text;

CREATE TABLE IF NOT EXISTS file_fornitore_ordine (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine_id       uuid NOT NULL REFERENCES ordini_fornitore(id) ON DELETE CASCADE,
  -- conferma = conferma d'ordine da firmare; documento = DDT, fattura di cortesia, altro
  tipo            text NOT NULL CHECK (tipo IN ('conferma', 'documento')),
  storage_path    text NOT NULL,
  nome_file       text NOT NULL,
  content_type    text,
  dimensione      bigint,
  caricato_da     text NOT NULL CHECK (caricato_da IN ('fornitore', 'utente')),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Solo per tipo = 'conferma'.
  -- da_firmare: caricata dal fornitore, aspetta la firma
  -- firmata: firmata dal gestionale e rimandata al fornitore
  -- firmata_manuale: caricata a mano gia' firmata (nessuna email)
  -- sostituita: il fornitore ne ha caricata una piu' recente prima della firma
  stato           text CHECK (stato IN ('da_firmare', 'firmata', 'firmata_manuale', 'sostituita')),
  firmata_path    text,
  firmata_at      timestamptz,
  firmata_da      uuid,
  note_firma      text,
  inviata_a       text,
  inviata_at      timestamptz,
  -- Prima apertura della conferma firmata da parte del fornitore (beacon client-side)
  letta_at        timestamptz,
  aperture        int NOT NULL DEFAULT 0,

  CONSTRAINT file_fornitore_stato_solo_conferma CHECK (
    (tipo = 'conferma' AND stato IS NOT NULL) OR (tipo = 'documento' AND stato IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_file_fornitore_ordine_ordine
  ON file_fornitore_ordine(ordine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_fornitore_ordine_da_firmare
  ON file_fornitore_ordine(organization_id) WHERE stato = 'da_firmare';

ALTER TABLE file_fornitore_ordine ENABLE ROW LEVEL SECURITY;

-- I caricamenti del fornitore arrivano col service role (pagina pubblica);
-- l'utente inserisce da se' solo la conferma gia' firmata.
CREATE POLICY "file_fornitore_ordine_select" ON file_fornitore_ordine
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "file_fornitore_ordine_insert" ON file_fornitore_ordine
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "file_fornitore_ordine_update" ON file_fornitore_ordine
  FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "file_fornitore_ordine_delete" ON file_fornitore_ordine
  FOR DELETE USING (organization_id = get_user_organization_id());
