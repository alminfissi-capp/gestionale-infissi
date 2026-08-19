-- Calendario digitale: un unico archivio di eventi con due viste.
-- La visibilita' e' una proprieta' del singolo evento (due flag), non del
-- calendario: nulla si riversa da una vista all'altra in automatico.

CREATE TABLE eventi_calendario (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tipo                     text        NOT NULL,
  titolo                   text,
  data                     date        NOT NULL,
  ora_inizio               time        NOT NULL,
  ora_fine                 time        NOT NULL,
  tutto_il_giorno          boolean     NOT NULL DEFAULT false,
  commessa_id              uuid        REFERENCES commesse(id) ON DELETE SET NULL,
  cliente_id               uuid        REFERENCES clienti(id) ON DELETE SET NULL,
  -- Snapshot testuale: nel gestionale esistono clienti fuori anagrafica, e
  -- l'etichetta ---CLIENTE--- deve funzionare anche senza cliente_id.
  cliente_nome             text,
  fornitore_id             uuid        REFERENCES fornitori(id) ON DELETE SET NULL,
  ordine_id                uuid        REFERENCES ordini_fornitore(id) ON DELETE SET NULL,
  scadenza_id              uuid        REFERENCES scadenze(id) ON DELETE CASCADE,
  -- Lega i giorni di una lavorazione continuativa: e' il connettore verticale
  -- disegnato a sinistra nel Gantt.
  catena_id                uuid,
  confermato_cliente       boolean     NOT NULL DEFAULT false,
  note                     text,
  visibile_produzione      boolean     NOT NULL DEFAULT true,
  visibile_amministrazione boolean     NOT NULL DEFAULT false,
  stato                    text        NOT NULL DEFAULT 'programmato',
  avvisato_email_at        timestamptz,
  avvisato_whatsapp_at     timestamptz,
  created_by               uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventi_calendario_ore_valide CHECK (ora_fine > ora_inizio),
  CONSTRAINT eventi_calendario_stato_valido
    CHECK (stato IN ('programmato', 'completato', 'annullato')),
  CONSTRAINT eventi_calendario_tipo_valido
    CHECK (tipo IN (
      'ricez_alluminio', 'lavorazione', 'ricez_vetri', 'ricez_accessori',
      'carico', 'posa',
      'appuntamento', 'impegno_interno', 'promemoria', 'scadenza'
    ))
);

CREATE INDEX eventi_calendario_org_data
  ON eventi_calendario (organization_id, data);
CREATE INDEX eventi_calendario_produzione
  ON eventi_calendario (organization_id, data) WHERE visibile_produzione;
CREATE INDEX eventi_calendario_amministrazione
  ON eventi_calendario (organization_id, data) WHERE visibile_amministrazione;
CREATE INDEX eventi_calendario_commessa ON eventi_calendario (commessa_id);
CREATE INDEX eventi_calendario_catena   ON eventi_calendario (catena_id);

-- Un ordine genera al massimo una ricezione; una scadenza compare una volta sola.
CREATE UNIQUE INDEX eventi_calendario_ordine_unico
  ON eventi_calendario (ordine_id) WHERE ordine_id IS NOT NULL;
CREATE UNIQUE INDEX eventi_calendario_scadenza_unica
  ON eventi_calendario (scadenza_id) WHERE scadenza_id IS NOT NULL;

ALTER TABLE eventi_calendario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON eventi_calendario
  FOR ALL USING (organization_id = get_user_organization_id());

-- Giorni di chiusura: date singole o intervalli (ferie, ponti, festivita').
CREATE TABLE chiusure (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data_inizio     date        NOT NULL,
  data_fine       date        NOT NULL,
  descrizione     text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chiusure_intervallo_valido CHECK (data_fine >= data_inizio)
);

CREATE INDEX chiusure_org_periodo ON chiusure (organization_id, data_inizio, data_fine);

ALTER TABLE chiusure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON chiusure
  FOR ALL USING (organization_id = get_user_organization_id());

-- Orari settimanali: array di 7 elementi, indice 0 = lunedi'. Le colonne orarie
-- del Gantt nascono da qui, non sono scritte nel codice.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS orari_lavoro jsonb
  NOT NULL DEFAULT '[
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "19:00"},
    {"aperto": true,  "apertura": "08:00", "chiusura": "12:30"},
    {"aperto": false, "apertura": "08:00", "chiusura": "19:00"}
  ]'::jsonb;

-- Decide quale dei tre tipi di ricezione nasce da un ordine di quel fornitore.
ALTER TABLE fornitori ADD COLUMN IF NOT EXISTS categoria_calendario text
  CHECK (categoria_calendario IN ('alluminio', 'vetri', 'accessori'));
