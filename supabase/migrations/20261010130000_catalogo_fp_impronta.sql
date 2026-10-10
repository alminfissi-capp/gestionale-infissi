-- ============================================================
-- 20261010130000_catalogo_fp_impronta.sql
-- Impronta (hash) di ogni riga del catalogo FP PRO: il ponte riscrive solo le
-- righe cambiate. Riscriverle tutte a ogni sincronizzazione lasciava ~100 MB
-- di righe morte al giorno.
-- sincronizzato_at da qui in poi = ultima volta che la riga e' stata scritta.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fp_serie','fp_profili','fp_profili_costi','fp_colori','fp_accessori',
                           'fp_accessori_costi','fp_vetri','fp_kit','fp_kit_righe']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS impronta text', t);
  END LOOP;
END $$;
