import { requireAccesso } from '@/lib/permessi'
import { getPaginaContabile } from '@/actions/contabilita-commessa'
import PaginaContabile from '@/components/contabilita/PaginaContabile'

export const dynamic = 'force-dynamic'

/**
 * Pagina contabile della commessa: costi reali dalle fatture d'acquisto FiC e a mano,
 * manodopera, costi fissi, stima e utile. Ci si arriva dalla scheda commessa e dalla
 * pagina della commessa in Produzione; serve il permesso Commesse.
 */
export default async function ContabilitaCommessaPage({ params }: { params: Promise<{ commessaId: string }> }) {
  await requireAccesso('commesse')
  const { commessaId } = await params
  const dati = await getPaginaContabile(commessaId)
  if ('errore' in dati) {
    return <p className="p-6 text-sm text-destructive">{dati.errore}</p>
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PaginaContabile dati={dati} />
    </div>
  )
}
