-- ============================================================
-- 20261005120000_preferenze_interfaccia.sql
-- Preferenze di visualizzazione di ciascun utente (es. come mostrare l'elenco
-- commesse sul telefono). Separate da preferenze_statistiche: sono scelte
-- dell'interfaccia, non dei grafici. Chiavi in types/preferenze.ts.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferenze_interfaccia jsonb NOT NULL DEFAULT '{}'::jsonb;
