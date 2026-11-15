-- ============================================================
-- 20261115120000_fp_accostamenti.sql
-- Accostamenti delle sezioni come li ha disegnati FP PRO (ante dentro la luce del telaio, fuga fra
-- le ante, vetro rispetto alla luce dell'anta). Li scrive il ponte leggendo le commesse calcolate
-- (cartella JOB): una riga per struttura (nome del file .STR, valido per tutte le sue copie) e
-- profili usati. Il calcolo li usa solo se i profili della voce sono gli stessi.
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_accostamenti (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  profili          text NOT NULL,
  nodi             jsonb NOT NULL DEFAULT '{}',
  origine          text,
  file_mtime       timestamptz,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, nome, profili)
);
CREATE INDEX IF NOT EXISTS fp_accostamenti_nome ON fp_accostamenti (organization_id, nome);

ALTER TABLE fp_accostamenti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fp_accostamenti_select ON fp_accostamenti;
CREATE POLICY fp_accostamenti_select ON fp_accostamenti FOR SELECT USING (organization_id = get_user_organization_id());
DROP TRIGGER IF EXISTS fp_accostamenti_segno_server ON fp_accostamenti;
CREATE TRIGGER fp_accostamenti_segno_server BEFORE INSERT OR UPDATE ON fp_accostamenti
  FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();
