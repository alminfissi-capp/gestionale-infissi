-- ============================================================
-- 20261011150000_rilievo_fp_segni_server.sql
-- Fase 3, correzioni dalla revisione:
-- 1. "segno" del server su rilievi, voci e catalogo FP PRO: lo scrive un trigger a ogni
--    inserimento/modifica (clock_timestamp). Il telefono riceve "tutto cio' che e' cambiato
--    dopo il segno X". Non si usa l'orario del telefono (aggiornatoAt): un rilievo fatto
--    senza rete alle 9 e inviato alle 18 avrebbe un orario vecchio e gli altri telefoni non
--    lo vedrebbero mai. aggiornatoAt resta solo per decidere chi vince tra due modifiche.
-- 2. fp_rilievi_eliminati: le eliminazioni arrivano agli altri telefoni e un telefono che
--    non lo sa non puo' far "risorgere" un rilievo eliminato.
-- ============================================================

CREATE OR REPLACE FUNCTION imposta_segno_server() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.segno_server := clock_timestamp();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rilievi_veloci', 'rilievo_veloce_voci', 'fp_serie', 'fp_profili', 'fp_colori',
                           'fp_vetri', 'fp_strutture']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS segno_server timestamptz NOT NULL DEFAULT clock_timestamp()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_segno_server', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION imposta_segno_server()',
                   t || '_segno_server', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id, segno_server)', 'idx_' || t || '_segno_server', t);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS fp_rilievi_eliminati (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('rilievo', 'voce')),
  rilievo_id      uuid,
  segno_server    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_fp_rilievi_eliminati_segno ON fp_rilievi_eliminati(organization_id, segno_server);

ALTER TABLE fp_rilievi_eliminati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_rilievi_eliminati_select" ON fp_rilievi_eliminati
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "fp_rilievi_eliminati_insert" ON fp_rilievi_eliminati
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
