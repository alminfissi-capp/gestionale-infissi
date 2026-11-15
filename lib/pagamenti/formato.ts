const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions);
export const euro = (n: number) => fmt.format(n);

export function nomeCliente(c: { nome?: string; cognome?: string; ragione_sociale?: string } | null | undefined) {
  if (!c) return '';
  return c.ragione_sociale?.trim() || [c.nome, c.cognome].filter(Boolean).join(' ');
}

export const ETICHETTE_STATO: Record<string, string> = {
  creato: 'Non completato',
  in_attesa: 'In conferma',
  pagato: 'Pagato',
  fallito: 'Non riuscito',
  scaduto: 'Scaduto',
  annullato: 'Sostituito',
  rimborsato: 'Rimborsato',
};

/** Frase da aggiungere al messaggio WhatsApp del preventivo; vuota se il pagamento online non e' attivo. */
export function testoWhatsappPagamento(esito: import('./regole').EsitoRegole, link: string): string {
  if (!esito.pagabile || esito.opzioni.length === 0) return ''
  const o = esito.opzioni[0]
  const cosa = o.tipo === 'acconto' ? `l'acconto di ${euro(o.importo)}` : giaPagatoTesto(esito.giaPagato, o.importo)
  const rate = o.rateIndicative.length > 0 ? ' (carta, PayPal o a rate)' : ' (carta o PayPal)'
  return `Puoi pagare ${cosa} online${rate} da qui: ${link}`
}

const giaPagatoTesto = (giaPagato: number, importo: number) => (giaPagato > 0 ? `il saldo di ${euro(importo)}` : `l'importo di ${euro(importo)}`)
