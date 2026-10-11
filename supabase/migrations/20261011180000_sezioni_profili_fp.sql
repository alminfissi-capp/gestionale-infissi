-- ============================================================
-- 20261011180000_sezioni_profili_fp.sql
-- Fase 4a: misure in vista dei profili lette dai DXF di FP PRO (lib/fppro/dxf-sezione.ts).
-- vista = larghezza in vista, aletta = parte oltre la vista che allunga i tagli (telai a Z).
-- fp_id = id del profilo (fp_profili.fp_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_profili_sezioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id integer NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati jsonb NOT NULL DEFAULT '{}',
  impronta text,
  segno_server timestamptz NOT NULL DEFAULT clock_timestamp(),
  codice text,
  vista numeric,
  aletta numeric,
  UNIQUE (organization_id, fp_id)
);
ALTER TABLE fp_profili_sezioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_profili_sezioni_select ON fp_profili_sezioni FOR SELECT USING (organization_id = get_user_organization_id());
CREATE TRIGGER fp_profili_sezioni_segno_server BEFORE INSERT OR UPDATE ON fp_profili_sezioni FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();
CREATE INDEX IF NOT EXISTS idx_fp_profili_sezioni_codice ON fp_profili_sezioni(organization_id, codice);
