-- ============================================================
-- 20261004100000_contabilita_commessa.sql
-- Pagina contabile di commessa: costi reali (articoli delle fatture FiC e costi a
-- mano), manodopera, costi fissi e stima. Dati solo WinStudio: la sincronizzazione
-- con Fatture in Cloud non li tocca.
-- ============================================================

CREATE TABLE costi_commessa (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL DEFAULT get_user_organization_id()
                                  REFERENCES organizations(id) ON DELETE CASCADE,
  commessa_id       uuid          NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  origine           text          NOT NULL CHECK (origine IN ('fattura', 'manuale')),
  categoria         text          NOT NULL CHECK (categoria IN (
                      'barre', 'accessori', 'accessori_secondari', 'riempimenti',
                      'spese_accessorie', 'trasporti', 'noleggi', 'altro')),
  descrizione       text          NOT NULL,
  quantita          numeric(12,3),
  importo           numeric(12,2) NOT NULL,
  -- Solo origine fattura: riferimento alla riga FiC e copia dei suoi dati
  fic_documento_id  bigint,
  fic_riga_id       bigint,
  tipo_documento    text          CHECK (tipo_documento IN ('fattura', 'nota_credito')),
  fornitore_nome    text,
  numero_documento  text,
  data_documento    date,
  codice            text,
  unita             text,
  quantita_fattura  numeric(12,3),
  prezzo_unitario   numeric(12,4),
  -- Solo origine manuale
  foto_path         text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CHECK (origine = 'manuale' OR (fic_documento_id IS NOT NULL AND fic_riga_id IS NOT NULL))
);

-- Una riga di fattura una sola volta per commessa (in quante commesse si vuole).
CREATE UNIQUE INDEX uq_costi_commessa_riga
  ON costi_commessa (commessa_id, fic_documento_id, fic_riga_id) WHERE origine = 'fattura';
CREATE INDEX idx_costi_commessa_commessa ON costi_commessa (commessa_id);
CREATE INDEX idx_costi_commessa_documento ON costi_commessa (organization_id, fic_documento_id);
CREATE INDEX idx_costi_commessa_codice ON costi_commessa (organization_id, codice);

ALTER TABLE costi_commessa ENABLE ROW LEVEL SECURITY;
-- Il browser legge soltanto; le scritture passano dalle Server Action col controllo
-- del permesso Commesse.
CREATE POLICY "costi_commessa_select" ON costi_commessa
  FOR SELECT USING (organization_id = get_user_organization_id());

CREATE TABLE contabilita_commessa (
  commessa_id          uuid          PRIMARY KEY REFERENCES commesse(id) ON DELETE CASCADE,
  organization_id      uuid          NOT NULL DEFAULT get_user_organization_id()
                                     REFERENCES organizations(id) ON DELETE CASCADE,
  posa_persone         numeric(6,2),
  posa_giorni          numeric(8,2),
  produzione_persone   numeric(6,2),
  produzione_giorni    numeric(8,2),
  altro_persone        numeric(6,2),
  altro_giorni         numeric(8,2),
  -- null = valore di Impostazioni
  tariffa_giornaliera  numeric(10,2),
  perc_costi_fissi     numeric(5,2),
  stima                jsonb,
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE contabilita_commessa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contabilita_commessa_select" ON contabilita_commessa
  FOR SELECT USING (organization_id = get_user_organization_id());

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS tariffa_manodopera_giornaliera numeric(10,2) NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS perc_costi_fissi numeric(5,2) NOT NULL DEFAULT 5;
