-- ============================================================
-- 20260723100000_ordini_magazzino.sql
-- Ordini fornitore anche senza commessa (ordini di magazzino):
-- commessa_id diventa nullable (NULL = ordine di magazzino).
-- ============================================================

ALTER TABLE ordini_fornitore ALTER COLUMN commessa_id DROP NOT NULL;
