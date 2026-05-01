-- Migra i preventivi scorrevoli dal filesystem locale al database.
-- Risolve: nessun isolamento multi-tenant, dati persi su Vercel (FS stateless),
-- race condition nella numerazione.
CREATE TABLE IF NOT EXISTS preventivi_scorrevoli (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero          TEXT,
  data            DATE NOT NULL DEFAULT CURRENT_DATE,
  stato           TEXT NOT NULL DEFAULT 'bozza'
                    CHECK (stato IN ('bozza','inviato','accettato','rifiutato')),
  cliente         JSONB NOT NULL DEFAULT '{}',
  righe           JSONB NOT NULL DEFAULT '[]',
  sconto_vetrata_prisma NUMERIC(6,4) NOT NULL DEFAULT 0,
  sconto_optional       NUMERIC(6,4) NOT NULL DEFAULT 0,
  trasporto             NUMERIC(6,4) NOT NULL DEFAULT 0,
  iva                   NUMERIC(6,4) NOT NULL DEFAULT 0.22,
  margine_alm           NUMERIC(6,4),
  note_generali         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contatore annuale per la numerazione atomica (riusa stesso pattern preventivi ordinari)
CREATE OR REPLACE FUNCTION increment_num_contatore_scorrevoli(p_org_id UUID)
RETURNS TABLE(contatore INT, anno INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW())::INT;
  v_new  INT;
  v_new_anno INT;
BEGIN
  UPDATE settings
  SET
    num_contatore_scorrevoli = CASE
      WHEN num_anno_scorrevoli IS DISTINCT FROM v_year THEN 1
      ELSE COALESCE(num_contatore_scorrevoli, 0) + 1
    END,
    num_anno_scorrevoli = v_year
  WHERE organization_id = p_org_id
  RETURNING num_contatore_scorrevoli, num_anno_scorrevoli
  INTO v_new, v_new_anno;

  RETURN QUERY SELECT v_new, v_new_anno;
END;
$$;

-- Colonne contatore scorrevoli nella tabella settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS num_contatore_scorrevoli INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_anno_scorrevoli      INT DEFAULT 0;

-- RLS
ALTER TABLE preventivi_scorrevoli ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select" ON preventivi_scorrevoli FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "ps_insert" ON preventivi_scorrevoli FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "ps_update" ON preventivi_scorrevoli FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "ps_delete" ON preventivi_scorrevoli FOR DELETE USING (organization_id = get_user_organization_id());
