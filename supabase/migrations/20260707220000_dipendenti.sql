-- ============================================================
-- 20260707220000_dipendenti.sql
-- Modulo Dipendenti: anagrafica, buste paga, pagamenti + bucket
-- ============================================================

CREATE TABLE dipendenti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  codice_fiscale TEXT,
  iban TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE buste_paga (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  dipendente_id UUID NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
  periodo DATE NOT NULL,
  mensilita TEXT NOT NULL DEFAULT 'mensile'
    CHECK (mensilita IN ('mensile', 'tredicesima', 'quattordicesima', 'altro')),
  netto NUMERIC(10,2) NOT NULL,
  lordo NUMERIC(10,2),
  file_path TEXT,
  pagina INT,
  dati_estratti JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pagamenti_dipendente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  dipendente_id UUID NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  importo NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  metodo TEXT NOT NULL DEFAULT 'bonifico'
    CHECK (metodo IN ('bonifico', 'contanti', 'altro')),
  periodo_competenza DATE NOT NULL,
  mensilita TEXT NOT NULL DEFAULT 'mensile'
    CHECK (mensilita IN ('mensile', 'tredicesima', 'quattordicesima', 'altro')),
  file_path TEXT,
  dati_estratti JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_buste_paga_dipendente ON buste_paga(dipendente_id, periodo);
CREATE INDEX idx_pagamenti_dipendente ON pagamenti_dipendente(dipendente_id, periodo_competenza);

ALTER TABLE dipendenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE buste_paga ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamenti_dipendente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dipendenti_select" ON dipendenti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_insert" ON dipendenti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_update" ON dipendenti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "dipendenti_delete" ON dipendenti FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "buste_paga_select" ON buste_paga FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_insert" ON buste_paga FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_update" ON buste_paga FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "buste_paga_delete" ON buste_paga FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "pagamenti_dipendente_select" ON pagamenti_dipendente FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_insert" ON pagamenti_dipendente FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_update" ON pagamenti_dipendente FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "pagamenti_dipendente_delete" ON pagamenti_dipendente FOR DELETE USING (organization_id = get_user_organization_id());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dipendenti-docs',
  'dipendenti-docs',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dipendenti_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'dipendenti-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "dipendenti_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dipendenti-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "dipendenti_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'dipendenti-docs' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

-- Aggiunge 'dipendenti' al check constraint di user_permissions
ALTER TABLE user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_modulo_check;

ALTER TABLE user_permissions
  ADD CONSTRAINT user_permissions_modulo_check
    CHECK (modulo IN (
      'preventivi','clienti','listini','cataloghi','rilievo','winconfig','magazzino','commesse','dipendenti','impostazioni'
    ));
