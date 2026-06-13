-- Tipo blocco: 'commesse' (default) o 'scadenze'
ALTER TABLE gruppi_commesse ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'commesse';

-- Scadenze fornitori / rateizzazioni.
-- Ogni blocco (gruppo) tipo='scadenze' = un anno; i 12 mesi derivano da data_scadenza.
CREATE TABLE scadenze (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gruppo_id        uuid        NOT NULL REFERENCES gruppi_commesse(id) ON DELETE CASCADE,
  data_scadenza    date        NOT NULL,
  descrizione      text        NOT NULL DEFAULT '',
  fornitore        text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  pagato           boolean     NOT NULL DEFAULT false,
  foto_path        text,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON scadenze
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX scadenze_gruppo_idx ON scadenze (gruppo_id);
