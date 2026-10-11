-- ============================================================
-- 20261011170000_regole_accessori_fp.sql
-- Fase 4a: regole degli accessori come FP PRO.
-- fp_kit_righe_serie: una riga di kit vale solo per le serie elencate (nessuna = tutte).
-- fp_accessori_collegati: accessori "contenitore" (es. kit cerniere) -> accessori contenuti.
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_kit_righe_serie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id integer NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati jsonb NOT NULL DEFAULT '{}',
  impronta text,
  segno_server timestamptz NOT NULL DEFAULT clock_timestamp(),
  riga_fp_id integer,
  serie text,
  UNIQUE (organization_id, fp_id)
);
CREATE TABLE IF NOT EXISTS fp_accessori_collegati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id integer NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati jsonb NOT NULL DEFAULT '{}',
  impronta text,
  segno_server timestamptz NOT NULL DEFAULT clock_timestamp(),
  codice_principale text,
  codice_collegato text,
  serie_collegato text,
  quantita numeric,
  tipo integer,
  opzionale boolean,
  UNIQUE (organization_id, fp_id)
);
ALTER TABLE fp_kit_righe_serie ENABLE ROW LEVEL SECURITY;
ALTER TABLE fp_accessori_collegati ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_kit_righe_serie_select ON fp_kit_righe_serie FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY fp_accessori_collegati_select ON fp_accessori_collegati FOR SELECT USING (organization_id = get_user_organization_id());
CREATE TRIGGER fp_kit_righe_serie_segno_server BEFORE INSERT OR UPDATE ON fp_kit_righe_serie FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();
CREATE TRIGGER fp_accessori_collegati_segno_server BEFORE INSERT OR UPDATE ON fp_accessori_collegati FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();
CREATE INDEX IF NOT EXISTS idx_fp_kit_righe_serie_riga ON fp_kit_righe_serie(organization_id, riga_fp_id);
CREATE INDEX IF NOT EXISTS idx_fp_accessori_collegati_principale ON fp_accessori_collegati(organization_id, codice_principale);
CREATE INDEX IF NOT EXISTS idx_fp_kit_righe_kit ON fp_kit_righe(organization_id, kit_fp_id);
