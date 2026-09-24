-- Amministratori senza busta paga.
--
-- Alcune persone in organico non ricevono cedolino: sono amministratori che
-- prelevano compensi quando serve. Per loro non esiste un "dovuto" mensile, e
-- quindi nemmeno un residuo: si registrano soltanto i pagamenti effettuati.
--
-- Due colonne distinte di proposito: il ruolo e' anagrafica, mentre a cambiare
-- i conti e' solo `riceve_busta_paga`. Cosi' resta possibile l'amministratore
-- che la busta paga invece ce l'ha, che si comporta come un dipendente
-- qualsiasi.
ALTER TABLE dipendenti
  ADD COLUMN ruolo TEXT NOT NULL DEFAULT 'dipendente'
    CHECK (ruolo IN ('dipendente', 'amministratore')),
  ADD COLUMN riceve_busta_paga BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN dipendenti.riceve_busta_paga IS
  'false = niente cedolino: nessun dovuto ne'' residuo, solo i compensi pagati. Il costo mensile di queste persone si conta alla data del pagamento.';
