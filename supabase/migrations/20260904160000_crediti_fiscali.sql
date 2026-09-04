-- 20260904160000_crediti_fiscali.sql
-- Crediti fiscali inseriti a mano: IVA a credito, acconti d'imposta versati,
-- crediti d'imposta di ogni genere. Le ritenute d'acconto NON stanno qui: si
-- calcolano da sole dagli acconti (acconti_commessa.ritenuta) e comparirebbero
-- due volte se le si registrasse anche a mano.
--
-- Ricalca `calcoli_incassi` (gli "incassi in attesa"): stessi campi, stesso
-- gesto per l'utente. `recuperato` e' l'equivalente di `incassato` — la voce
-- esce dal totale ma la riga resta come storico di cio' che si e' compensato.

CREATE TABLE IF NOT EXISTS crediti_fiscali (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome             text        NOT NULL DEFAULT '',
  descrizione      text        NOT NULL DEFAULT '',
  importo          numeric     NOT NULL DEFAULT 0,
  recuperato       boolean     NOT NULL DEFAULT false,
  ordine           int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crediti_fiscali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON crediti_fiscali
  FOR ALL USING (organization_id = get_user_organization_id());

CREATE INDEX IF NOT EXISTS idx_crediti_fiscali_org
  ON crediti_fiscali(organization_id, ordine);
