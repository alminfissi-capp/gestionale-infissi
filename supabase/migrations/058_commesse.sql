-- ============================================================
-- 058_commesse.sql
-- Modulo Commesse: ordini confermati, acconti, documenti
-- ============================================================

CREATE TABLE commesse (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero_commessa TEXT NOT NULL DEFAULT '',
  preventivo_id UUID REFERENCES preventivi(id) ON DELETE SET NULL,
  numero_preventivo TEXT,
  cliente_nome TEXT NOT NULL,
  imponibile NUMERIC(10,2) NOT NULL DEFAULT 0,
  iva_totale NUMERIC(10,2) NOT NULL DEFAULT 0,
  totale NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_conferma DATE NOT NULL DEFAULT CURRENT_DATE,
  operatore_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  operatore_nome TEXT,
  note TEXT,
  stato TEXT NOT NULL DEFAULT 'in_lavorazione'
    CHECK (stato IN ('in_lavorazione', 'completata', 'annullata')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE acconti_commessa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commessa_id UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  importo NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pagamento TEXT NOT NULL DEFAULT 'contanti'
    CHECK (metodo_pagamento IN ('contanti', 'bonifico', 'riba', 'altro')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE documenti_commessa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  commessa_id UUID NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  nome_file TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo_documento TEXT NOT NULL DEFAULT 'fattura',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commesse ENABLE ROW LEVEL SECURITY;
ALTER TABLE acconti_commessa ENABLE ROW LEVEL SECURITY;
ALTER TABLE documenti_commessa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commesse_select" ON commesse FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "commesse_insert" ON commesse FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "commesse_update" ON commesse FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "commesse_delete" ON commesse FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "acconti_commessa_select" ON acconti_commessa FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "acconti_commessa_insert" ON acconti_commessa FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "acconti_commessa_delete" ON acconti_commessa FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "documenti_commessa_select" ON documenti_commessa FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "documenti_commessa_insert" ON documenti_commessa FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "documenti_commessa_delete" ON documenti_commessa FOR DELETE USING (organization_id = get_user_organization_id());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commesse-docs',
  'commesse-docs',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "commesse_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'commesse-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "commesse_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'commesse-docs' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );

CREATE POLICY "commesse_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'commesse-docs' AND
    (storage.foldername(name))[1] = get_user_organization_id()::text
  );
