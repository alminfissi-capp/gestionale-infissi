-- ============================================================
-- 20261011160000_calcolo_fp.sql
-- Fase 4a: dati per calcolare come FP PRO (profili di calcolo, barre, scarti,
-- profili composti, pannelli, ore delle strutture) e collegamento al preventivo.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_config_prev', 'fp_barre', 'fp_pannelli', 'fp_profili_componenti', 'fp_scarti']
  LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        fp_id            integer NOT NULL,
        presente         boolean NOT NULL DEFAULT true,
        sincronizzato_at timestamptz NOT NULL DEFAULT now(),
        dati             jsonb NOT NULL DEFAULT '{}',
        impronta         text,
        segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (organization_id, fp_id)
      )$f$, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (organization_id = get_user_organization_id())', t || '_select', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_segno_server', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION imposta_segno_server()', t || '_segno_server', t);
  END LOOP;
END $$;

-- Colonne specifiche (le stesse che scrive lib/fppro/sync-tabelle.ts).
ALTER TABLE fp_config_prev
  ADD COLUMN IF NOT EXISTS nome text, ADD COLUMN IF NOT EXISTS spese_generali numeric, ADD COLUMN IF NOT EXISTS utile numeric,
  ADD COLUMN IF NOT EXISTS provvigione numeric, ADD COLUMN IF NOT EXISTS costo_taglio numeric, ADD COLUMN IF NOT EXISTS costo_lavorazione numeric,
  ADD COLUMN IF NOT EXISTS costo_montaggio numeric, ADD COLUMN IF NOT EXISTS costo_assemblaggio numeric, ADD COLUMN IF NOT EXISTS costo_posa numeric,
  ADD COLUMN IF NOT EXISTS imballo numeric, ADD COLUMN IF NOT EXISTS viaggio numeric, ADD COLUMN IF NOT EXISTS materiali_vari numeric,
  ADD COLUMN IF NOT EXISTS altro numeric;
ALTER TABLE fp_barre ADD COLUMN IF NOT EXISTS profilo_fp_id integer, ADD COLUMN IF NOT EXISTS lunghezza numeric;
ALTER TABLE fp_pannelli
  ADD COLUMN IF NOT EXISTS codice text, ADD COLUMN IF NOT EXISTS descrizione text, ADD COLUMN IF NOT EXISTS prezzo_mq numeric,
  ADD COLUMN IF NOT EXISTS min_fatt numeric;
ALTER TABLE fp_profili_componenti
  ADD COLUMN IF NOT EXISTS composto_fp_id integer, ADD COLUMN IF NOT EXISTS componente_fp_id integer, ADD COLUMN IF NOT EXISTS principale boolean,
  ADD COLUMN IF NOT EXISTS tipo integer, ADD COLUMN IF NOT EXISTS offset_mm numeric;
ALTER TABLE fp_scarti ADD COLUMN IF NOT EXISTS codice text, ADD COLUMN IF NOT EXISTS testa numeric, ADD COLUMN IF NOT EXISTS coda numeric;
CREATE INDEX IF NOT EXISTS idx_fp_barre_profilo ON fp_barre(organization_id, profilo_fp_id);
CREATE INDEX IF NOT EXISTS idx_fp_componenti_composto ON fp_profili_componenti(organization_id, composto_fp_id);
CREATE INDEX IF NOT EXISTS idx_fp_scarti_codice ON fp_scarti(organization_id, codice);
CREATE INDEX IF NOT EXISTS idx_fp_pannelli_codice ON fp_pannelli(organization_id, codice);

-- Ore della struttura; versione_lettura: il ponte rilegge le strutture lette con una versione vecchia.
ALTER TABLE fp_strutture ADD COLUMN IF NOT EXISTS tempi jsonb;
ALTER TABLE fp_strutture ADD COLUMN IF NOT EXISTS versione_lettura integer NOT NULL DEFAULT 1;

-- Rilievo: profilo di calcolo scelto e ultimo calcolo (fotografia).
ALTER TABLE rilievi_veloci ADD COLUMN IF NOT EXISTS config_prev_fp_id integer;
ALTER TABLE rilievi_veloci ADD COLUMN IF NOT EXISTS calcolo jsonb;

-- Riga di preventivo nata da una struttura FP PRO (resta di tipo 'libera').
ALTER TABLE articoli_preventivo ADD COLUMN IF NOT EXISTS config_fppro jsonb;
