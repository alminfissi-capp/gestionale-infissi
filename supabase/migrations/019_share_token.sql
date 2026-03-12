-- Aggiunge colonne per condivisione pubblica preventivi
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS condiviso_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visualizzato_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_preventivi_share_token
  ON preventivi(share_token) WHERE share_token IS NOT NULL;

-- Accesso pubblico (anon) tramite share_token
CREATE POLICY "preventivi_public_select" ON preventivi
  FOR SELECT TO anon
  USING (share_token IS NOT NULL);

CREATE POLICY "preventivi_public_update_viewed" ON preventivi
  FOR UPDATE TO anon
  USING (share_token IS NOT NULL)
  WITH CHECK (share_token IS NOT NULL);

CREATE POLICY "articoli_public_select" ON articoli_preventivo
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM preventivi p
      WHERE p.id = preventivo_id AND p.share_token IS NOT NULL
    )
  );

-- Dati azienda (denominazione, indirizzo, logo) necessari per visualizzazione pubblica
CREATE POLICY "settings_public_select" ON settings
  FOR SELECT TO anon
  USING (true);
