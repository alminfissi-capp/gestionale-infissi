-- ============================================================
-- 20260723090000_permesso_dashboard.sql
-- Aggiunge il modulo 'dashboard' ai permessi utente
-- ============================================================

ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;

ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo = ANY (ARRAY[
    'dashboard',
    'preventivi',
    'clienti',
    'listini',
    'cataloghi',
    'rilievo',
    'winconfig',
    'magazzino',
    'commesse',
    'dipendenti',
    'produzione',
    'impostazioni'
  ]::text[]));
