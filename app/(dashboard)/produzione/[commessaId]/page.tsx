import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import {
  getCommessaProduzione, getOrdiniCommessa, getFornitoriPerOrdine, getProssimoNumeroOrdine,
} from '@/actions/produzione'
import { getDocumentiProduzione } from '@/actions/produzione-documenti'
import { getSettings } from '@/actions/impostazioni'
import ProduzioneCommessa from '@/components/produzione/ProduzioneCommessa'

export const dynamic = 'force-dynamic'

export default async function ProduzioneCommessaPage({
  params,
}: {
  params: Promise<{ commessaId: string }>
}) {
  await requireAccesso('produzione')
  const { commessaId } = await params

  const commessa = await getCommessaProduzione(commessaId)
  if (!commessa) notFound()

  const [ordini, fornitori, numeroProposto, documenti, settings] = await Promise.all([
    getOrdiniCommessa(commessaId),
    getFornitoriPerOrdine(),
    getProssimoNumeroOrdine(),
    getDocumentiProduzione(commessaId),
    getSettings(),
  ])

  const intestazione = {
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
    indirizzo: settings?.indirizzo ?? '',
    piva: settings?.piva ?? '',
  }

  return (
    <ProduzioneCommessa
      commessa={commessa}
      ordini={ordini}
      fornitori={fornitori}
      numeroProposto={numeroProposto}
      documenti={documenti}
      intestazione={intestazione}
    />
  )
}
