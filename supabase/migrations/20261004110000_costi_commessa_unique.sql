-- ============================================================
-- 20261004110000_costi_commessa_unique.sql
-- L'indice unico parziale (WHERE origine = 'fattura') non puo' essere usato da
-- INSERT ... ON CONFLICT (commessa_id, fic_documento_id, fic_riga_id): il
-- salvataggio degli articoli falliva con "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
-- Vincolo pieno al suo posto: i costi a mano hanno fic_documento_id e fic_riga_id
-- NULL, e i NULL non si considerano mai uguali, quindi non entrano in conflitto.
-- ============================================================

DROP INDEX IF EXISTS uq_costi_commessa_riga;
ALTER TABLE costi_commessa
  ADD CONSTRAINT uq_costi_commessa_riga UNIQUE (commessa_id, fic_documento_id, fic_riga_id);
