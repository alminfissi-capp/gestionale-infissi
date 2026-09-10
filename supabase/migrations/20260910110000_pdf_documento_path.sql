-- ============================================================
-- 20260910110000_pdf_documento_path.sql
-- Separa la copia d'archivio da quella destinata al fornitore.
--
-- pdf_path resta la copia PULITA: la route di invio la congela in
-- pdf_inviato_path per il fornitore, che non deve leggere il footer di
-- tracking (vedrebbe quando lui stesso ha aperto il documento).
-- pdf_documento_path e' invece la copia che compare tra i documenti della
-- commessa, dove il footer con invio e ricezione serve come ricevuta.
-- Quando l'ordine non e' ancora partito le due copie coincidono e il file
-- caricato resta uno solo.
-- ============================================================

ALTER TABLE ordini_fornitore
  ADD COLUMN IF NOT EXISTS pdf_documento_path text;

COMMENT ON COLUMN ordini_fornitore.pdf_documento_path IS
  'Copia con footer di tracking mostrata tra i documenti di commessa; puo'' coincidere con pdf_path se l''ordine non e'' ancora stato inviato.';

-- Gli ordini gia' in archivio hanno un'unica copia: la si dichiara come tale.
UPDATE ordini_fornitore
SET pdf_documento_path = pdf_path
WHERE pdf_path IS NOT NULL AND pdf_documento_path IS NULL;
