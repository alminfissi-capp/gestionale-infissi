-- ============================================================
-- 065_user_permissions_add_commesse.sql
-- Aggiunge 'commesse' al check constraint modulo di user_permissions
-- ============================================================

ALTER TABLE user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;

ALTER TABLE user_permissions
  ADD CONSTRAINT user_permissions_modulo_check
    CHECK (modulo IN (
      'preventivi','clienti','listini','cataloghi','rilievo','winconfig','magazzino','commesse','impostazioni'
    ));
