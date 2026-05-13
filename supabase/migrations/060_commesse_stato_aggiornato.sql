-- 060_commesse_stato_aggiornato.sql
-- Aggiorna i valori ammessi per la colonna stato di commesse

-- Rimuove il vecchio vincolo
ALTER TABLE commesse DROP CONSTRAINT IF EXISTS commesse_stato_check;

-- Migra i vecchi valori
UPDATE commesse SET stato = 'concluso'   WHERE stato = 'completata';
UPDATE commesse SET stato = 'annullato'  WHERE stato = 'annullata';

-- Aggiunge il nuovo vincolo con tutti gli stati
ALTER TABLE commesse ADD CONSTRAINT commesse_stato_check
  CHECK (stato IN (
    'in_attesa',
    'da_iniziare',
    'in_lavorazione',
    'da_consegnare',
    'consegnato',
    'parzialmente_consegnato',
    'concluso',
    'bloccato',
    'annullato'
  ));

-- Aggiorna il default
ALTER TABLE commesse ALTER COLUMN stato SET DEFAULT 'in_attesa';
