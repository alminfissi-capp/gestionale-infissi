-- ============================================================
-- 030 — Rilievo Veloce
-- Tabelle per il modulo rilievo misure semplificato
-- ============================================================

-- Opzioni configurabili per i menu a tendina del rilievo veloce
CREATE TABLE IF NOT EXISTS rilievo_opzioni (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('accessorio', 'colore', 'vetro', 'serratura')),
  valore           TEXT NOT NULL,
  ordine           INT  NOT NULL DEFAULT 0,
  attiva           BOOL NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Rilievi veloci (intestazione — dati cantiere/cliente)
CREATE TABLE IF NOT EXISTS rilievi_veloci (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cliente_snapshot JSONB NOT NULL DEFAULT '{}',
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Voci del rilievo (un serramento per riga)
CREATE TABLE IF NOT EXISTS rilievo_veloce_voci (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rilievo_id      UUID NOT NULL REFERENCES rilievi_veloci(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordine          INT  NOT NULL DEFAULT 0,
  voce            TEXT,           -- identificatore posizione (es. "F1", "Bagno")
  quantita        INT  NOT NULL DEFAULT 1,
  tipologia       TEXT,           -- descrizione libera
  larghezza_mm    INT,
  altezza_mm      INT,
  accessori       TEXT[] NOT NULL DEFAULT '{}',
  colore_interno  TEXT,
  bicolore        BOOL NOT NULL DEFAULT false,
  colore_esterno  TEXT,
  tipologia_vetro TEXT,
  anta_ribalta    BOOL NOT NULL DEFAULT false,
  serratura       BOOL NOT NULL DEFAULT false,
  tipo_serratura  TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_rilievo_opzioni_org   ON rilievo_opzioni (organization_id, tipo, ordine);
CREATE INDEX IF NOT EXISTS idx_rilievi_veloci_org    ON rilievi_veloci  (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rilievo_voci_rilievo  ON rilievo_veloce_voci (rilievo_id, ordine);

-- RLS
ALTER TABLE rilievo_opzioni      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rilievi_veloci       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rilievo_veloce_voci  ENABLE ROW LEVEL SECURITY;

-- Policy: accesso solo alla propria organizzazione
CREATE POLICY "rilievo_opzioni_org" ON rilievo_opzioni
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "rilievi_veloci_org" ON rilievi_veloci
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "rilievo_veloce_voci_org" ON rilievo_veloce_voci
  USING (organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));
