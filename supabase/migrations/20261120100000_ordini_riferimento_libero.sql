-- ============================================================
-- 20261120100000_ordini_riferimento_libero.sql
-- Ordini fornitore dal magazzino: oltre a commessa e magazzino, un nominativo scritto a mano
-- (es. sostituzione in garanzia di un lavoro di anni fa senza commessa). Vale solo senza commessa.
-- ============================================================
ALTER TABLE ordini_fornitore ADD COLUMN IF NOT EXISTS riferimento_libero TEXT;
