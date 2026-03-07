-- ============================================================
-- 014_subscription.sql
-- Supporto abbonamenti e ruoli estesi per monetizzazione SaaS
-- ============================================================

-- Piani disponibili su organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial', 'base', 'pro', 'business')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Imposta trial_ends_at = 14 giorni dalla creazione per le org già esistenti
UPDATE organizations
  SET trial_ends_at = created_at + INTERVAL '14 days'
  WHERE trial_ends_at IS NULL;

-- Ruoli estesi su profiles: aggiunge 'viewer' oltre ai già esistenti
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'operator', 'viewer'));

-- Tabella inviti per FASE 6 (team management)
CREATE TABLE IF NOT EXISTS invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('admin', 'operator', 'viewer')),
  token           TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage invites"
  ON invites FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
