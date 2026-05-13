-- 059_commesse_ordine.sql
-- Aggiunge colonna ordine per drag-and-drop riordinamento commesse

ALTER TABLE commesse ADD COLUMN IF NOT EXISTS ordine INTEGER NOT NULL DEFAULT 0;

-- Assegna ordine iniziale basato su data_conferma DESC per ogni organizzazione
WITH numbered AS (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY data_conferma DESC, created_at DESC) - 1) AS rn
  FROM commesse
)
UPDATE commesse SET ordine = numbered.rn FROM numbered WHERE commesse.id = numbered.id;
