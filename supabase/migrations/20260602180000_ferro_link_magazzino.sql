-- Collega voci listino ferro a prodotti in catalogo_articoli.
-- ON DELETE SET NULL: se il prodotto magazzino viene eliminato,
-- la voce ferro resta manuale con l'ultimo prezzo copiato.

ALTER TABLE ferro_sezioni_piene
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES catalogo_articoli(id) ON DELETE SET NULL;

ALTER TABLE ferro_sezioni_colonna
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES catalogo_articoli(id) ON DELETE SET NULL;

ALTER TABLE ferro_binari
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES catalogo_articoli(id) ON DELETE SET NULL;

ALTER TABLE ferro_accessori
  ADD COLUMN IF NOT EXISTS magazzino_prodotto_id uuid
    REFERENCES catalogo_articoli(id) ON DELETE SET NULL;
