-- Allegati PDF (bonifici) sulle scadenze: l'immagine della prima pagina viene
-- generata al caricamento e salvata accanto al PDF, cosi' anteprima e stampa
-- funzionano come per le foto senza ricostruire il PDF ogni volta.
-- Resta NULL per gli allegati immagine, dove il file stesso e' gia' l'immagine.
ALTER TABLE scadenze ADD COLUMN anteprima_path text;
