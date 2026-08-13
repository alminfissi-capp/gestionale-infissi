-- Resoconto economico di commessa: documento riepilogativo per il cliente.
-- Una riga per commessa; gli incassi non si salvano qui, si rileggono sempre
-- da acconti_commessa, che resta la fonte di verita'.
CREATE TABLE resoconti_commessa (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id          uuid        NOT NULL UNIQUE REFERENCES commesse(id) ON DELETE CASCADE,
  data_documento       date        NOT NULL DEFAULT CURRENT_DATE,
  cliente_indirizzo    text,
  cliente_piva         text,
  cliente_cf           text,
  cantiere_nome        text,
  cantiere_indirizzo   text,
  progetto_titolo      text,
  progetto_sottotitolo text,
  progetto_cup         text,
  righe_preventivi     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  righe_fatture        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  nota_fatture         text,
  nota_titolo          text,
  nota_testo           text,
  nota_finale          text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE resoconti_commessa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON resoconti_commessa
  FOR ALL USING (organization_id = get_user_organization_id());
