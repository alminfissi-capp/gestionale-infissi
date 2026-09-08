-- ============================================================
-- 20260908100000_permesso_calendario.sql
-- Aggiunge il modulo 'calendario' ai permessi utente
-- (era presente in types/permessi.ts ma non nel CHECK del DB)
-- ============================================================

ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;

ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_modulo_check
  CHECK (modulo = ANY (ARRAY[
    'dashboard',
    'calendario',
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
