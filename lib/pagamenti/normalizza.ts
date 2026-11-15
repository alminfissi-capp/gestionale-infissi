// Condiviso tra server e pannello operatore (nessuna dipendenza lato server).
import type { ImpostazioniPreventivo } from './tipi';

export const CAMPI_IMPOSTAZIONI =
  'preventivo_id, abilitato, modalita, acconto_percentuale, rate_abilitate, saldo_online, con_detrazione_fiscale, importo_personalizzato';

export function normalizzaImpostazioni(r: Record<string, unknown> | null): ImpostazioniPreventivo | null {
  if (!r) return null;
  return {
    preventivo_id: r.preventivo_id as string,
    abilitato: r.abilitato === true,
    modalita: r.modalita === 'totale' ? 'totale' : 'percentuale',
    acconto_percentuale: r.acconto_percentuale == null ? null : Number(r.acconto_percentuale),
    rate_abilitate: r.rate_abilitate !== false,
    saldo_online: r.saldo_online !== false,
    con_detrazione_fiscale: r.con_detrazione_fiscale === true,
    importo_personalizzato: r.importo_personalizzato == null ? null : Number(r.importo_personalizzato),
  };
}
