-- ============================================================
-- 20261115130000_togli_accesso_pubblico_preventivi.sql
-- Sicurezza: le policy per il ruolo anon (migration 019) permettevano a chiunque avesse la chiave
-- pubblica di LEGGERE tutti i preventivi con share_token (clienti, articoli con costi e calcolo
-- interno), di MODIFICARLI (qualunque colonna) e di leggere tutta la tabella settings (firme, timbro,
-- IBAN, tariffe). La pagina /p/[token] ora legge dal server il solo preventivo del link.
-- ============================================================

DROP POLICY IF EXISTS "preventivi_public_select" ON preventivi;
DROP POLICY IF EXISTS "preventivi_public_update_viewed" ON preventivi;
DROP POLICY IF EXISTS "articoli_public_select" ON articoli_preventivo;
DROP POLICY IF EXISTS "settings_public_select" ON settings;
