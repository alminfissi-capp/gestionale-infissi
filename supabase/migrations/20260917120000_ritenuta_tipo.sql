-- 20260917120000_ritenuta_tipo.sql
-- La seconda ritenuta sugli incassi: il 4% dei condomini.
--
-- Il condominio e' sostituto d'imposta: sui lavori che gli fatturi trattiene il
-- 4% dell'imponibile della fattura e lo versa all'Erario per tuo conto. Come per
-- l'11% del bonifico parlante, il cliente ha pagato tutto: e' in azienda che
-- entra meno denaro.
--
-- Le due sono ALTERNATIVE, mai sommate: se il pagamento arriva col bonifico
-- parlante il condominio non applica anche il suo 4%. Per questo `ritenuta`
-- resta la cifra unica in euro e la colonna nuova dice solo di quale delle due
-- si tratta: chi legge per sommare (flusso di cassa, crediti fiscali) continua a
-- sommare `ritenuta` senza sapere niente del tipo.
--
-- Si salva il TIPO e non l'aliquota per la stessa ragione per cui si salva la
-- cifra e non una spunta: le aliquote sono numeri di legge che cambiano (l'11%
-- era all'8% fino al 2022), il tipo di ritenuta no.

ALTER TABLE acconti_commessa
  ADD COLUMN IF NOT EXISTS ritenuta_tipo TEXT;

-- Gli acconti gia' marcati sono tutti dell'unica ritenuta che esisteva finora.
UPDATE acconti_commessa
  SET ritenuta_tipo = 'detrazioni'
  WHERE ritenuta > 0 AND ritenuta_tipo IS NULL;

UPDATE acconti_commessa
  SET ritenuta_tipo = NULL
  WHERE ritenuta = 0 AND ritenuta_tipo IS NOT NULL;

-- O ci sono cifra e tipo, o non c'e' nessuno dei due: una riga con la cifra e
-- senza tipo mostrerebbe in interfaccia una ritenuta senza nome, e una col tipo
-- e senza cifra una trattenuta da zero euro.
ALTER TABLE acconti_commessa
  DROP CONSTRAINT IF EXISTS acconti_commessa_ritenuta_tipo_valido;

ALTER TABLE acconti_commessa
  ADD CONSTRAINT acconti_commessa_ritenuta_tipo_valido
  CHECK (
    (ritenuta = 0 AND ritenuta_tipo IS NULL)
    OR (ritenuta > 0 AND ritenuta_tipo IN ('detrazioni', 'condominio'))
  );
