-- 20260831120000_commesse_anonime.sql
-- Commesse anonime: le vendite e-commerce/eBay sono ricavi a tutti gli effetti
-- ma non sono lavori. Vengono salvate come commesse marchiate `anonima`, cosi'
-- entrano da sole in fatturato, flusso di cassa e costi/utile, e vengono
-- escluse con un filtro esplicito da produzione, calendario e anticipi.

CREATE TABLE IF NOT EXISTS sezioni_anonime (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gruppo_id        uuid        NOT NULL REFERENCES gruppi_commesse(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sezioni_anonime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON sezioni_anonime
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_sezioni_anonime_gruppo
  ON sezioni_anonime(organization_id, gruppo_id, ordine);

-- `anonima` e' una colonna a se' e non un valore di `stato` o di `reparti`:
-- deve poter essere filtrata senza dipendere da campi che l'utente modifica.
-- `aliquota_iva` e' memorizzata invece di essere ricavata da iva/imponibile:
-- il rapporto fra due importi gia' arrotondati non ridarebbe sempre l'aliquota
-- digitata, e riaprire una vendita mostrerebbe 22,01 al posto di 22.
ALTER TABLE commesse
  ADD COLUMN IF NOT EXISTS anonima            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sezione_anonima_id uuid REFERENCES sezioni_anonime(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS canale             text,
  ADD COLUMN IF NOT EXISTS aliquota_iva       numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_commesse_anonima
  ON commesse(organization_id, anonima);
CREATE INDEX IF NOT EXISTS idx_commesse_sezione_anonima
  ON commesse(sezione_anonima_id);
