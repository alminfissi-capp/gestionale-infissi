// Validazione delle impostazioni inviate dal pannello operatore.
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniPreventivo } from './tipi';

export function validaImpostazioni(preventivoId: string, input: unknown): ImpostazioniPreventivo {
  const x = (input ?? {}) as Record<string, unknown>;
  const perc = x.acconto_percentuale == null || x.acconto_percentuale === '' ? null : Number(x.acconto_percentuale);
  if (perc !== null && !(Number.isFinite(perc) && perc > 0 && perc < 100)) {
    throw new Error('La percentuale deve essere tra 1 e 99');
  }
  const importo = x.importo_personalizzato == null || x.importo_personalizzato === '' ? null : Number(x.importo_personalizzato);
  if (importo !== null && !(Number.isFinite(importo) && importo > 0)) throw new Error('Importo non valido');
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const d = IMPOSTAZIONI_PREDEFINITE;
  return {
    preventivo_id: preventivoId,
    abilitato: bool(x.abilitato, d.abilitato),
    modalita: x.modalita === 'totale' ? 'totale' : 'percentuale',
    acconto_percentuale: perc === null ? null : Math.round(perc * 100) / 100,
    rate_abilitate: bool(x.rate_abilitate, d.rate_abilitate),
    saldo_online: bool(x.saldo_online, d.saldo_online),
    con_detrazione_fiscale: bool(x.con_detrazione_fiscale, d.con_detrazione_fiscale),
    importo_personalizzato: importo,
  };
}
