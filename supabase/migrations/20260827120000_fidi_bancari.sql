-- Esposizione bancaria: fido di cassa sui conti + anticipi fattura per commessa.
-- Convenzioni d'inserimento opposte e volute (vedi spec 2026-08-27-fidi-bancari):
--  · conto corrente → si scrive il DISPONIBILE, l'utilizzato si ricava
--  · linea di credito → si scrivono i singoli ANTICIPI, utilizzato e disponibile si ricavano

-- Default 0: i conti esistenti restano senza fido, nessun numero si muove al deploy.
ALTER TABLE conti_correnti ADD COLUMN IF NOT EXISTS fido_accordato numeric NOT NULL DEFAULT 0;

-- Il plafond, e basta: nessuna colonna "disponibile", sarebbe un secondo modo di dire
-- la stessa cosa e prima o poi i due numeri litigherebbero.
CREATE TABLE linee_credito (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  tipo             text        NOT NULL DEFAULT 'anticipo_fatture',
  accordato        numeric     NOT NULL DEFAULT 0,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE linee_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON linee_credito
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX linee_credito_org_idx ON linee_credito (organization_id);

-- commessa_id facoltativo e ON DELETE SET NULL: non tutte le fatture nascono da una
-- commessa registrata, e cancellare una commessa non cancella il debito con la banca.
CREATE TABLE anticipi_fattura (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linea_id         uuid        NOT NULL REFERENCES linee_credito(id) ON DELETE CASCADE,
  commessa_id      uuid        REFERENCES commesse(id) ON DELETE SET NULL,
  descrizione      text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  data_erogazione  date,
  data_scadenza    date,
  rimborsato       boolean     NOT NULL DEFAULT false,
  rimborsato_at    date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE anticipi_fattura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON anticipi_fattura
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX anticipi_fattura_org_idx ON anticipi_fattura (organization_id);
CREATE INDEX anticipi_fattura_linea_idx ON anticipi_fattura (linea_id);
