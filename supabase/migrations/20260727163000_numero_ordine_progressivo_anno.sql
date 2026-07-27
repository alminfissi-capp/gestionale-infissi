-- ============================================================
-- 20260727163000_numero_ordine_progressivo_anno.sql
-- Allinea i numeri ordine al formato NNN-AAAA (mostrato "ORD 011-2026").
-- Converte il vecchio formato AAAA-NNN e riempie di zeri i progressivi corti.
-- I numeri liberi scritti a mano restano intatti.
-- ============================================================

-- Vecchio formato AAAA-NNN -> NNN-AAAA
UPDATE ordini_fornitore
SET numero_ordine =
      lpad(split_part(btrim(numero_ordine), '-', 2), 3, '0')
      || '-' || split_part(btrim(numero_ordine), '-', 1)
WHERE btrim(numero_ordine) ~ '^\d{4}-\d{1,4}$'
  AND split_part(btrim(numero_ordine), '-', 1)::int >= 2000
  -- AAAA-AAAA è ambiguo: come in parseNumeroOrdine vince il nuovo formato
  AND NOT (
    split_part(btrim(numero_ordine), '-', 2) ~ '^\d{4}$'
    AND split_part(btrim(numero_ordine), '-', 2)::int >= 2000
  );

-- Nuovo formato senza zeri iniziali: 11-2026 -> 011-2026
UPDATE ordini_fornitore
SET numero_ordine =
      lpad(split_part(btrim(numero_ordine), '-', 1), 3, '0')
      || '-' || split_part(btrim(numero_ordine), '-', 2)
WHERE btrim(numero_ordine) ~ '^\d{1,3}-\d{4}$'
  AND split_part(btrim(numero_ordine), '-', 2)::int >= 2000
  AND numero_ordine <> lpad(split_part(btrim(numero_ordine), '-', 1), 3, '0')
                       || '-' || split_part(btrim(numero_ordine), '-', 2);
