-- ============================================================
-- 20260712200000_altri_dipendenti.sql
-- Altri Dipendenti: stipendi e pagamenti manuali (settimanale/mensile)
-- ============================================================

CREATE TABLE altri_dipendenti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  cadenza TEXT NOT NULL CHECK (cadenza IN ('settimanale', 'mensile')),
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE movimenti_altro_dipendente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  altro_dipendente_id UUID NOT NULL REFERENCES altri_dipendenti(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('stipendio', 'pagamento')),
  periodo DATE NOT NULL,
  importo NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  data_pagamento DATE,
  metodo TEXT CHECK (metodo IN ('bonifico', 'contanti', 'altro')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movimenti_altro ON movimenti_altro_dipendente(altro_dipendente_id, periodo);

ALTER TABLE altri_dipendenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_altro_dipendente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "altri_dipendenti_select" ON altri_dipendenti FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_insert" ON altri_dipendenti FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_update" ON altri_dipendenti FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "altri_dipendenti_delete" ON altri_dipendenti FOR DELETE USING (organization_id = get_user_organization_id());

CREATE POLICY "movimenti_altro_select" ON movimenti_altro_dipendente FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_insert" ON movimenti_altro_dipendente FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_update" ON movimenti_altro_dipendente FOR UPDATE USING (organization_id = get_user_organization_id());
CREATE POLICY "movimenti_altro_delete" ON movimenti_altro_dipendente FOR DELETE USING (organization_id = get_user_organization_id());
