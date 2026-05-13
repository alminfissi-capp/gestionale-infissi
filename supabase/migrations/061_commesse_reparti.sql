-- 061_commesse_reparti.sql
-- Aggiunge colonna reparti (array) alle commesse

ALTER TABLE commesse ADD COLUMN IF NOT EXISTS reparti text[] NOT NULL DEFAULT '{}';
