-- ============================================================
-- 20261114120000_fissaggi_parametri_fp.sql
-- Kit e accessori come FP PRO (spec 2026-11-14-kit-come-fppro-design.md). Le scrive il ponte:
-- 1. fp_fissaggi        = squadrette/cavallotti per profilo e sistema di giunzione (MySQL fissaggi)
-- 2. fp_serie_fissaggi  = sistemi di giunzione della serie con ordine (MySQL serie_profilo_fissaggi)
-- 3. fp_nomi_brevi      = nomi brevi da cantiere corretti a mano (chiave 'kit:<codice minuscolo>')
-- ============================================================

CREATE TABLE IF NOT EXISTS fp_fissaggi (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id             integer NOT NULL,
  codice_profilo    text,
  codice_accessorio text,
  serie_fp_id       integer,
  quantita          numeric,
  dim_rif           integer,
  filtro            text,
  presente          boolean NOT NULL DEFAULT true,
  sincronizzato_at  timestamptz NOT NULL DEFAULT now(),
  dati              jsonb NOT NULL DEFAULT '{}',
  impronta          text,
  segno_server      timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, fp_id)
);
CREATE INDEX IF NOT EXISTS fp_fissaggi_profilo ON fp_fissaggi (organization_id, codice_profilo);

CREATE TABLE IF NOT EXISTS fp_serie_fissaggi (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fp_id            integer NOT NULL,
  serie_fp_id      integer,
  ordine           integer,
  tipo             integer,
  filtro           text,
  presente         boolean NOT NULL DEFAULT true,
  sincronizzato_at timestamptz NOT NULL DEFAULT now(),
  dati             jsonb NOT NULL DEFAULT '{}',
  impronta         text,
  segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, fp_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_fissaggi', 'fp_serie_fissaggi'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (organization_id = get_user_organization_id())', t || '_select', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_segno_server', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION imposta_segno_server()', t || '_segno_server', t);
  END LOOP;
END $$;

-- Nomi brevi corretti a mano: li scrivono gli utenti dell'organizzazione (pagina Catalogo FP PRO).
CREATE TABLE IF NOT EXISTS fp_nomi_brevi (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT get_user_organization_id(),
  chiave           text NOT NULL,
  nome             text NOT NULL CHECK (length(trim(nome)) > 0),
  aggiornato_at    timestamptz NOT NULL DEFAULT now(),
  segno_server     timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (organization_id, chiave)
);
ALTER TABLE fp_nomi_brevi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fp_nomi_brevi_tutto ON fp_nomi_brevi;
CREATE POLICY fp_nomi_brevi_tutto ON fp_nomi_brevi FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());
DROP TRIGGER IF EXISTS fp_nomi_brevi_segno_server ON fp_nomi_brevi;
CREATE TRIGGER fp_nomi_brevi_segno_server BEFORE INSERT OR UPDATE ON fp_nomi_brevi
  FOR EACH ROW EXECUTE FUNCTION imposta_segno_server();
