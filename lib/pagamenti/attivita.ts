// Pagamenti online nella dashboard (Attivita' recenti) e passaggio in commessa (parte pura).
import { formatEuro } from '@/lib/pricing'
import { nomeMetodo } from './metodo'

export interface RigaPagamentoDashboard {
  id: string
  importo: number
  stato: string
  metodo: string | null
  pagato_at: string | null
  updated_at: string
  preventivo_id: string
  cliente: string
  commessa_id: string | null
}

export interface VocePagamento {
  tipo: 'pagamento'
  azione: string
  descrizione: string
  href: string
  data: string
}

/** "Pagato online — € 300,00 (Klarna)" o "Pagamento online rimborsato — € 300,00"; link alla commessa se c'e'. */
export function vociPagamentiDashboard(righe: RigaPagamentoDashboard[]): VocePagamento[] {
  return righe
    .filter(r => r.stato === 'pagato' || r.stato === 'rimborsato')
    .map(r => ({
      tipo: 'pagamento' as const,
      azione: r.stato === 'pagato'
        ? `Pagato online — € ${formatEuro(Number(r.importo))} (${nomeMetodo(r.metodo)})`
        : `Pagamento online rimborsato — € ${formatEuro(Number(r.importo))}`,
      descrizione: r.cliente || 'Cliente',
      href: r.commessa_id ? `/commesse/${r.commessa_id}` : `/preventivi/${r.preventivo_id}`,
      data: (r.stato === 'pagato' ? r.pagato_at : r.updated_at) ?? r.updated_at,
    }))
}

/** Pagamenti riusciti ancora senza acconto in commessa; `conAcconto` = pagamenti che ne hanno gia' uno. */
export function pagamentiDaRegistrare(
  pagamenti: { id: string; stato: string; acconto_commessa_id: string | null }[],
  conAcconto: Set<string>,
): string[] {
  return pagamenti.filter(p => p.stato === 'pagato' && !p.acconto_commessa_id && !conAcconto.has(p.id)).map(p => p.id)
}
