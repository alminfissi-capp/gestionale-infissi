-- ============================================================
-- 041_listini_su_misura.sql
-- Nuova categoria tipo 'su_misura': prezzo €/mq, finiture,
-- gruppi accessori (pz/mq/ml), mano d'opera e utile in preventivo
-- ============================================================

-- 1. Aggiorna check su tipo categoria
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'categorie_listini'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE 'ALTER TABLE categorie_listini DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

ALTER TABLE categorie_listini
  ADD CONSTRAINT categorie_listini_tipo_check
    CHECK (tipo IN ('griglia', 'libero', 'su_misura'));

-- 2. Listini su misura (un prodotto per record)
CREATE TABLE listini_su_misura (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria_id        UUID        NOT NULL REFERENCES categorie_listini(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  descrizione         TEXT,
  prezzo_mq           NUMERIC(10,2) NOT NULL DEFAULT 0,
  prezzo_acquisto_mq  NUMERIC(10,2) NOT NULL DEFAULT 0,
  larghezza_min       INTEGER     NOT NULL DEFAULT 0,
  larghezza_max       INTEGER     NOT NULL DEFAULT 9999,
  altezza_min         INTEGER     NOT NULL DEFAULT 0,
  altezza_max         INTEGER     NOT NULL DEFAULT 9999,
  mq_minimo           NUMERIC(6,3) NOT NULL DEFAULT 0,
  immagine_url        TEXT,
  ordine              INTEGER     NOT NULL DEFAULT 0,
  attivo              BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_listini_su_misura_cat ON listini_su_misura(categoria_id);

-- 3. Finiture per listino su misura
CREATE TABLE finiture_su_misura (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listino_id          UUID        NOT NULL REFERENCES listini_su_misura(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  tipo_maggiorazione  TEXT        NOT NULL DEFAULT 'percentuale'
                        CHECK (tipo_maggiorazione IN ('percentuale', 'mq', 'fisso')),
  valore              NUMERIC(10,2) NOT NULL DEFAULT 0,
  prezzo_acquisto     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordine              INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_finiture_su_misura ON finiture_su_misura(listino_id);

-- 4. Gruppi di accessori
CREATE TABLE gruppi_accessori_su_misura (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listino_id          UUID        NOT NULL REFERENCES listini_su_misura(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  tipo_scelta         TEXT        NOT NULL DEFAULT 'multiplo'
                        CHECK (tipo_scelta IN ('singolo', 'multiplo', 'incluso')),
  ordine              INTEGER     NOT NULL DEFAULT 0
);
CREATE INDEX idx_gruppi_acc_su_misura ON gruppi_accessori_su_misura(listino_id);

-- 5. Accessori
CREATE TABLE accessori_su_misura (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gruppo_id           UUID        NOT NULL REFERENCES gruppi_accessori_su_misura(id) ON DELETE CASCADE,
  nome                TEXT        NOT NULL,
  unita               TEXT        NOT NULL DEFAULT 'pz'
                        CHECK (unita IN ('pz', 'mq', 'ml')),
  prezzo              NUMERIC(10,2) NOT NULL DEFAULT 0,
  prezzo_acquisto     NUMERIC(10,2) NOT NULL DEFAULT 0,
  qty_modificabile    BOOLEAN     NOT NULL DEFAULT false,
  qty_default         NUMERIC(8,3) NOT NULL DEFAULT 1,
  ordine              INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accessori_su_misura ON accessori_su_misura(gruppo_id);

-- 6. Aggiorna articoli_preventivo
ALTER TABLE articoli_preventivo
  DROP CONSTRAINT IF EXISTS articoli_preventivo_tipo_check;

ALTER TABLE articoli_preventivo
  ADD CONSTRAINT articoli_preventivo_tipo_check
    CHECK (tipo IN ('listino', 'libera', 'listino_libero', 'scorrevole', 'su_misura'));

ALTER TABLE articoli_preventivo
  ADD COLUMN IF NOT EXISTS config_su_misura JSONB DEFAULT NULL;

-- 7. RLS
ALTER TABLE listini_su_misura        ENABLE ROW LEVEL SECURITY;
ALTER TABLE finiture_su_misura       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gruppi_accessori_su_misura ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessori_su_misura      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listini_sm_select"  ON listini_su_misura FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_sm_insert"  ON listini_su_misura FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "listini_sm_update"  ON listini_su_misura FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "listini_sm_delete"  ON listini_su_misura FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "finiture_sm_select" ON finiture_su_misura FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "finiture_sm_insert" ON finiture_su_misura FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "finiture_sm_update" ON finiture_su_misura FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "finiture_sm_delete" ON finiture_su_misura FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "gruppi_acc_sm_select" ON gruppi_accessori_su_misura FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "gruppi_acc_sm_insert" ON gruppi_accessori_su_misura FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "gruppi_acc_sm_update" ON gruppi_accessori_su_misura FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "gruppi_acc_sm_delete" ON gruppi_accessori_su_misura FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "accessori_sm_select" ON accessori_su_misura FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "accessori_sm_insert" ON accessori_su_misura FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "accessori_sm_update" ON accessori_su_misura FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "accessori_sm_delete" ON accessori_su_misura FOR DELETE USING (organization_id = get_user_organization_id());
