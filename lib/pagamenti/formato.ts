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
