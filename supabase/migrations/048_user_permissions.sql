-- ============================================================
-- 048_user_permissions.sql
-- Permessi per utente per modulo applicativo
-- ============================================================

-- Aggiunge email a profiles (cache, evita join con auth.users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Imposta come admin tutti gli utenti esistenti (bootstrap: c'è solo l'owner)
UPDATE profiles SET role = 'admin' WHERE role = 'operator';

-- Tabella permessi
CREATE TABLE user_permissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo          TEXT        NOT NULL CHECK (modulo IN (
    'preventivi','clienti','listini','cataloghi','rilievo','winconfig','magazzino','impostazioni'
  )),
  accesso         TEXT        NOT NULL DEFAULT 'nessuno'
                    CHECK (accesso IN ('nessuno','lettura','scrittura')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id, modulo)
);

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Gli utenti leggono solo i propri permessi
CREATE POLICY "perm_self_read" ON user_permissions
  FOR SELECT USING (user_id = auth.uid());
