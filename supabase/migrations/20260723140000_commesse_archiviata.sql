-- ============================================================
-- 20260723140000_commesse_archiviata.sql
-- Flag di archiviazione commesse (usato dal lato Produzione).
-- ============================================================

ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS archiviata BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_commesse_archiviata ON commesse(organization_id, archiviata);
