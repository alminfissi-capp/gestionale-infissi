-- anticipi_fattura.commessa_id è una FK ON DELETE SET NULL: senza indice ogni
-- cancellazione di una commessa costringe Postgres a scandire tutta la tabella
-- per trovare le righe che la referenziano. È l'unica FK della migrazione
-- 20260827120000 rimasta senza indice.
CREATE INDEX IF NOT EXISTS anticipi_fattura_commessa_idx ON anticipi_fattura (commessa_id);
