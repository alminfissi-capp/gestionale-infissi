-- Irrigidimento: fissare il search_path impedisce che un oggetto creato in uno
-- schema di passaggio dirotti il comportamento della funzione. Non cambia cosa
-- fanno. Migrazione separata da quella delle tabelle Ferro, cosi' se qualcosa
-- si comporta in modo strano e' chiaro cosa tornare indietro.
--
-- Le prime tre sono SECURITY DEFINER (girano con i privilegi del proprietario,
-- quindi sono quelle che contano davvero). Le altre tre sono SECURITY INVOKER:
-- rischio molto piu' basso, ma la correzione e' identica e a costo zero.

ALTER FUNCTION public.get_user_organization_id()                    SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_num_contatore(p_org_id uuid)        SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_num_contatore_scorrevoli(p_org_id uuid) SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_fn_ca_search_vector()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.get_reparti_conteggio(p_org_id uuid)          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_gruppi_conteggio(p_org_id uuid, p_reparto smallint) SET search_path = public, pg_temp;
