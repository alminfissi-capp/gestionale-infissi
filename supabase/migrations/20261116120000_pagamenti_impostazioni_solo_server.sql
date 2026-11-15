-- ============================================================
-- 20261116120000_pagamenti_impostazioni_solo_server.sql
-- Revisione finale: le policy di scrittura controllavano solo organization_id e non a chi appartiene il
-- preventivo (un'organizzazione poteva attivare il pagamento su un preventivo altrui). WinStudio scrive
-- queste impostazioni solo dal server (actions/pagamenti.ts, service role, controllo del preventivo):
-- resta solo la lettura per organizzazione.
-- ============================================================
DROP POLICY IF EXISTS pag_imp_insert ON public.pagamenti_impostazioni_preventivo;
DROP POLICY IF EXISTS pag_imp_update ON public.pagamenti_impostazioni_preventivo;
DROP POLICY IF EXISTS pag_imp_delete ON public.pagamenti_impostazioni_preventivo;
