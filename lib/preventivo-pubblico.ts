// Cosa del preventivo arriva nel browser del cliente (pagina pubblica /p/[token]).
// La pagina legge dal server (service role) il solo preventivo del link: qui si tolgono i dati interni
// prima di passarli al componente client, che finiscono altrimenti nell'HTML della pagina.
import type { ArticoloPreventivoRow, PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'
import { senzaDatiProvvigione } from '@/lib/provvigione'

/** Dati dell'azienda che il documento del cliente mostra (intestazione e piede) */
export const CAMPI_SETTINGS_PUBBLICI = ['organization_id', 'denominazione', 'indirizzo', 'piva', 'codice_fiscale', 'telefono', 'email', 'logo_url', 'sito_web'] as const

export function settingsPerCliente(s: Settings | null): Settings | null {
  if (!s) return null
  const pubblici = Object.fromEntries(CAMPI_SETTINGS_PUBBLICI.map(k => [k, (s as unknown as Record<string, unknown>)[k] ?? null]))
  return pubblici as unknown as Settings
}

/** Articolo senza costi d'acquisto, posa e calcolo interno FP PRO */
export function articoloPerCliente(a: ArticoloPreventivoRow): ArticoloPreventivoRow {
  const { config_fppro: _calcoloInterno, ...resto } = a
  return { ...resto, costo_acquisto_unitario: 0, costo_posa: 0, costo_prodotto_bypass: null }
}

/**
 * Preventivo per il cliente: senza provvigione, costi d'acquisto, token del callback di firma
 * (con quello si potrebbe segnare il preventivo come firmato) e id del documento di firma.
 */
export function preventivoPerCliente(p: PreventivoCompleto): PreventivoCompleto {
  return {
    ...senzaDatiProvvigione(p),
    provvigione_percentuale: 0, provvigione_importo: 0, provvigione_importo_fisso: null,
    totale_costi_acquisto: 0,
    token_conferma: null,
    firma_documento_id: null,
    articoli: p.articoli.map(articoloPerCliente),
  }
}
