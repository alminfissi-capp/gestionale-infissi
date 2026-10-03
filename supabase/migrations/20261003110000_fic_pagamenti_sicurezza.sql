-- ============================================================
-- 20261003110000_fic_pagamenti_sicurezza.sql
-- Correzioni dalla revisione della fase 2:
-- 1. scadenze_fatture in sola lettura dal browser: un utente non deve poter
--    scrivere a mano una scrittura_fic e far togliere da FiC pagamenti altrui.
--    Le scritture passano solo dalle Server Action (service role).
-- 2. stato 'in_corso': il collegamento e' "preso" mentre WinStudio parla con
--    FiC, cosi' due clic o due utenti non scrivono due volte.
-- 3. intenzione_fic: cosa WinStudio sta per scrivere, salvata prima del PUT,
--    per riconoscere una scrittura avvenuta di cui si e' persa la risposta.
-- ============================================================

DROP POLICY IF EXISTS "scadenze_fatture_org" ON scadenze_fatture;
CREATE POLICY "scadenze_fatture_select" ON scadenze_fatture
  FOR SELECT USING (organization_id = get_user_organization_id());

ALTER TABLE scadenze_fatture DROP CONSTRAINT IF EXISTS scadenze_fatture_stato_fic_check;
ALTER TABLE scadenze_fatture ADD CONSTRAINT scadenze_fatture_stato_fic_check
  CHECK (stato_fic IN ('non_scritto', 'scritto', 'da_allineare', 'da_verificare', 'in_corso'));

ALTER TABLE scadenze_fatture ADD COLUMN IF NOT EXISTS intenzione_fic jsonb;
