-- ============================================================
-- 066_ferro_rls_policies.sql
-- RLS policies per le tabelle ferro (condivise tra utenti autenticati)
-- ============================================================

-- ferro_sezioni_piene
CREATE POLICY "ferro_sezioni_piene_auth"
  ON ferro_sezioni_piene FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ferro_sezioni_colonna
CREATE POLICY "ferro_sezioni_colonna_auth"
  ON ferro_sezioni_colonna FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ferro_binari
CREATE POLICY "ferro_binari_auth"
  ON ferro_binari FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ferro_accessori
CREATE POLICY "ferro_accessori_auth"
  ON ferro_accessori FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ferro_preventivi
CREATE POLICY "ferro_preventivi_auth"
  ON ferro_preventivi FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
