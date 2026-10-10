-- ============================================================
-- 20261011100000_strutture_fp.sql
-- Strutture (tipologie) di FP PRO: fase 2 del progetto rilievo -> preventivo -> FP PRO.
-- Le scrive solo il ponte sul PC; una riga per file .STR, chiave = percorso
-- relativo alla cartella STR di FP PRO. errore valorizzato = file non leggibile
-- (resta in tabella per non rileggerlo a ogni giro finche' non cambia).
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_strutture (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  percorso         text NOT NULL,
  cartella         text NOT NULL,
  nome             text NOT NULL,
  codice           text,
  descrizione      text,
  serie            text[] NOT NULL DEFAULT '{}',
  l_nominale       numeric,
  h_nominale       numeric,
  albero           jsonb NOT NULL DEFAULT '[]',
  poligoni         jsonb NOT NULL DEFAULT '[]',
  immagine         text,
  errore           text,
  file_mtime       timestamptz NOT NULL,
  file_size        bigint NOT NULL,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, percorso)
);
CREATE INDEX IF NOT EXISTS idx_fp_strutture_serie ON fp_strutture USING gin (serie);
CREATE INDEX IF NOT EXISTS idx_fp_strutture_cartella ON fp_strutture(organization_id, cartella);

ALTER TABLE fp_strutture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_strutture_select" ON fp_strutture
  FOR SELECT USING (organization_id = get_user_organization_id());

-- Conteggi per i filtri della pagina (security_invoker: valgono le RLS di chi legge).
CREATE OR REPLACE VIEW fp_strutture_serie WITH (security_invoker = true) AS
  SELECT organization_id, s AS serie, count(*)::int AS strutture
  FROM fp_strutture, unnest(serie) AS s
  WHERE presente
  GROUP BY organization_id, s;

CREATE OR REPLACE VIEW fp_strutture_cartelle WITH (security_invoker = true) AS
  SELECT organization_id, cartella, count(*)::int AS strutture
  FROM fp_strutture
  WHERE presente
  GROUP BY organization_id, cartella;

-- Immagini delle strutture (PNG convertiti dal BMP che FP PRO salva nel file).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fp-strutture', 'fp-strutture', false, 1048576, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fp_strutture_img_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fp-strutture' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
