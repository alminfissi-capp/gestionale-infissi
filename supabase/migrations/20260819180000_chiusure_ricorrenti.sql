-- Chiusure ricorrenti: le festivita' si indicano una volta sola con giorno e
-- mese, e tornano ogni anno. Per queste righe l'anno memorizzato e' il 2000
-- (bisestile, cosi' il 29 febbraio e' rappresentabile) e viene ignorato.
ALTER TABLE chiusure ADD COLUMN IF NOT EXISTS ricorrente boolean NOT NULL DEFAULT true;

-- Un periodo ricorrente puo' scavalcare il capodanno (24/12 - 06/01): in quel
-- caso la data di fine precede quella di inizio, quindi il vincolo vale solo
-- per le chiusure legate a un anno preciso.
ALTER TABLE chiusure DROP CONSTRAINT IF EXISTS chiusure_intervallo_valido;
ALTER TABLE chiusure ADD CONSTRAINT chiusure_intervallo_valido
  CHECK (ricorrente OR data_fine >= data_inizio);
