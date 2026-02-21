-- ============================================================
-- seed.sql
-- Dati iniziali per l'organizzazione A.L.M. Infissi
-- ATTENZIONE: eseguire DOPO aver creato manualmente il primo
-- utente tramite Supabase Auth (dashboard o API)
-- ============================================================

-- 1. Inserisci l'organizzazione
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'A.L.M. Infissi')
ON CONFLICT (id) DO NOTHING;

-- 2. Inserisci il profilo utente
-- Sostituisci <USER_UUID> con l'UUID del primo utente creato in Supabase Auth
-- INSERT INTO profiles (id, organization_id, full_name, role)
-- VALUES ('<USER_UUID>', '00000000-0000-0000-0000-000000000001', 'Admin', 'admin');

-- 3. Inserisci le impostazioni aziendali iniziali
INSERT INTO settings (organization_id, denominazione)
VALUES ('00000000-0000-0000-0000-000000000001', 'A.L.M. Infissi')
ON CONFLICT (organization_id) DO NOTHING;
