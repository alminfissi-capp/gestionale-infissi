-- ============================================================
-- seed.sql
-- Dati iniziali per l'organizzazione A.L.M. Infissi
-- Eseguire nel SQL Editor di Supabase DOPO aver creato l'utente
-- ============================================================

-- 1. Organizzazione
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'A.L.M. Infissi')
ON CONFLICT (id) DO NOTHING;

-- 2. Profilo utente (alminfissi@gmail.com)
INSERT INTO profiles (id, organization_id, full_name, role)
VALUES (
  '7e06e7fe-c2cb-4c11-8d9a-ecadf3c3fcea',
  '00000000-0000-0000-0000-000000000001',
  'A.L.M. Infissi',
  'admin'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Impostazioni aziendali iniziali
INSERT INTO settings (organization_id, denominazione)
VALUES ('00000000-0000-0000-0000-000000000001', 'A.L.M. Infissi')
ON CONFLICT (organization_id) DO NOTHING;
