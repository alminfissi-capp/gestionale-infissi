-- ============================================================
-- 20261024140000_fp_accessori_serie.sql
-- Marchi e serie degli accessori di FP PRO, per sfogliarli quando si aggiunge un accessorio
-- a una voce del rilievo (es. MEDISYSTEM > AUTOMAZIONI > motore vasistas). Il marchio arriva
-- dal ponte in fp_accessori.dati->>'marca_nome' (ponte 1.6.0). security_invoker: valgono le
-- policy di fp_accessori (solo la propria organizzazione).
-- ============================================================

CREATE OR REPLACE VIEW fp_accessori_serie WITH (security_invoker = true) AS
SELECT organization_id,
       COALESCE(NULLIF(dati->>'marca_nome', ''), '') AS marca,
       COALESCE(serie, '') AS serie,
       COUNT(*)::int AS accessori
FROM fp_accessori
WHERE presente
GROUP BY 1, 2, 3;
