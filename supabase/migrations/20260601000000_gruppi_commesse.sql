-- Tabella blocchi commesse
CREATE TABLE gruppi_commesse (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE gruppi_commesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON gruppi_commesse
  FOR ALL USING (organization_id = get_user_organization_id());

-- FK su commesse (nullable: nessuna commessa esistente viene rifiutata)
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS gruppo_id uuid REFERENCES gruppi_commesse(id);

-- Seed: crea gruppo "2026" per ogni org che ha commesse (idempotente)
INSERT INTO gruppi_commesse (organization_id, nome, ordine)
SELECT DISTINCT c.organization_id, '2026', 0
FROM commesse c
WHERE c.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gruppi_commesse g
    WHERE g.organization_id = c.organization_id AND g.nome = '2026'
  );

-- Assegna le commesse esistenti al gruppo "2026" della loro org
UPDATE commesse c
SET gruppo_id = g.id
FROM gruppi_commesse g
WHERE g.organization_id = c.organization_id
  AND g.nome = '2026'
  AND c.gruppo_id IS NULL;
