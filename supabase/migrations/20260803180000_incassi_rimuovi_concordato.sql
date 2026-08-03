-- Il campo "incasso concordato" si e' rivelato inutile al primo uso reale:
-- nessuna delle prime righe inserite lo aveva valorizzato. Toglierlo restituisce
-- spazio alla riga, che deve stare comoda anche su telefono.
-- Verificato prima di eliminarlo che la colonna fosse vuota su tutte le righe.
ALTER TABLE calcoli_incassi DROP COLUMN incasso_concordato;
