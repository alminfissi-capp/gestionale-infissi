-- ============================================================
-- 20261025100000_opzioni_semplici_fp.sql
-- Opzioni semplici della voce (spec 2026-10-25-opzioni-semplici-voce-design.md):
-- 1. fp_kit_gruppi = gruppi di alternative di FP PRO (MySQL gruppiopzkit): nome della
--    domanda e tipo (0 = scegli uno, 1 = facoltativo, 2 = anche piu' di uno). Lo scrive il ponte.
-- 2. fp_accessori_a_colore = accessori con un prezzo per colore accessori (codice -> colori),
--    per mostrare in cantiere solo i colori che esistono davvero.
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_kit_gruppi (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  descrizione      text,
  tipo             integer,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  impronta         text,
  segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, fp_id)
);
ALTER TABLE fp_kit_gruppi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fp_kit_gruppi_select ON fp_kit_gruppi;
CREATE POLICY fp_kit_gruppi_select ON fp_kit_gruppi FOR SELECT USING (organization_id = get_user_organization_id());
DROP TRIGGER IF EXISTS fp_kit_gruppi_segno_server ON fp_kit_gruppi;
CREATE TRIGGER fp_kit_gruppi_segno_server BEFORE INSERT OR UPDATE ON fp_kit_gruppi
  FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();

-- generale = c'e' anche un prezzo generale (> 0): senza il colore giusto il calcolo usa quello.
CREATE OR REPLACE VIEW fp_accessori_a_colore WITH (security_invoker = true) AS
SELECT a.organization_id,
       a.codice,
       array_agg(DISTINCT c.colore_fp_id ORDER BY c.colore_fp_id) AS colori,
       bool_or(COALESCE(a.prezzo, 0) > 0) AS generale
FROM fp_accessori a
JOIN fp_accessori_costi c
  ON c.organization_id = a.organization_id AND c.accessorio_fp_id = a.fp_id
 AND c.presente AND COALESCE(c.prezzo, 0) > 0 AND c.colore_fp_id IS NOT NULL
WHERE a.presente
GROUP BY a.organization_id, a.codice;
