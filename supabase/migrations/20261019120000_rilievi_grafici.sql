-- ============================================================
-- 20261019120000_rilievi_grafici.sql
-- Rilievo grafico: serramenti fuori standard disegnati come in FP PRO (forma, montanti,
-- traversi, ante, riempimenti) e completati in ufficio con profili, vetri e pannelli.
-- Un rilievo = un serramento; il disegno sta tutto in `disegno` (jsonb).
-- id scelto dal dispositivo (si crea anche senza rete); aggiornato_at = orario del
-- dispositivo dell'ultima modifica: decide chi vince tra due copie.
-- ============================================================

CREATE TABLE IF NOT EXISTS rilievi_grafici (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT get_user_organization_id() REFERENCES organizations(id) ON DELETE CASCADE,
  nome            text NOT NULL DEFAULT '',
  cliente         text NOT NULL DEFAULT '',
  note            text NOT NULL DEFAULT '',
  quantita        integer NOT NULL DEFAULT 1 CHECK (quantita > 0),
  disegno         jsonb NOT NULL,
  creato_at       timestamptz NOT NULL DEFAULT now(),
  aggiornato_at   timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rilievi_grafici_org ON rilievi_grafici(organization_id, aggiornato_at DESC);

ALTER TABLE rilievi_grafici ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rilievi_grafici_select" ON rilievi_grafici
  FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "rilievi_grafici_insert" ON rilievi_grafici
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "rilievi_grafici_update" ON rilievi_grafici
  FOR UPDATE USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "rilievi_grafici_delete" ON rilievi_grafici
  FOR DELETE USING (organization_id = get_user_organization_id());

-- Pannelli usati nelle strutture di FP PRO (file della cartella Dxf\PANELS): in MySQL non
-- c'e' un elenco dei pannelli, quindi si offrono quelli che compaiono nelle strutture.
CREATE OR REPLACE FUNCTION fp_pannelli_strutture()
RETURNS TABLE (dxf text, utilizzi bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE nodi AS (
    SELECT jsonb_array_elements(albero) AS n FROM fp_strutture
    WHERE organization_id = get_user_organization_id() AND presente
    UNION ALL
    SELECT jsonb_array_elements(n->'figli') FROM nodi
  )
  SELECT p->>'dxf', count(*)
  FROM nodi, jsonb_array_elements(n->'pezzi') p
  WHERE (p->>'tipo')::int = 8500 AND coalesce(p->>'dxf', '') <> ''
  GROUP BY 1
  ORDER BY 1
$$;
