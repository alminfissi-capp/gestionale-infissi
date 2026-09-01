-- 20260901120000_preferenze_statistiche.sql
-- Preferenze personali della pagina statistiche, a partire dall'ordine dei
-- blocchi. Su `profiles` e non su `settings` perche' e' una scelta di chi
-- guarda, non dell'organizzazione: due persone possono volere ordini diversi.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferenze_statistiche jsonb NOT NULL DEFAULT '{}'::jsonb;
