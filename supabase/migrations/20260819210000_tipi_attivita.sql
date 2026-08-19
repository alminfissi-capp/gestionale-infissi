-- Tipi di attività personalizzabili: etichetta, colore e "evidenzia il giorno"
-- diventano dati dell'organizzazione invece che costanti nel codice.
CREATE TABLE IF NOT EXISTS tipi_attivita (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Chiave stabile: e' quello che finisce in eventi_calendario.tipo. Cambiando
  -- l'etichetta gli eventi gia' inseriti restano collegati.
  chiave           text        NOT NULL,
  etichetta        text        NOT NULL,
  sfondo           text        NOT NULL,
  testo            text        NOT NULL,
  ambito           text        NOT NULL CHECK (ambito IN ('produzione', 'amministrazione')),
  -- Colora il riquadro del giorno nel Gantt, come fa la posa sul foglio in officina.
  evidenzia_giorno boolean     NOT NULL DEFAULT false,
  -- I tipi di sistema ('scadenza') non si eliminano: nascono da altri moduli.
  sistema          boolean     NOT NULL DEFAULT false,
  ordine           integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipi_attivita_chiave_unica UNIQUE (organization_id, chiave)
);

ALTER TABLE tipi_attivita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON tipi_attivita
  FOR ALL USING (organization_id = get_user_organization_id());

-- I tipi non sono piu' una lista chiusa: il vincolo li terrebbe fermi a quelli
-- scritti nel codice. L'integrita' la fa l'anagrafica qui sopra.
ALTER TABLE eventi_calendario DROP CONSTRAINT IF EXISTS eventi_calendario_tipo_valido;
