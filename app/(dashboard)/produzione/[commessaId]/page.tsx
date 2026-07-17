import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import {
  getCommessaProduzione, getOrdiniCommessa, getFornitoriPerOrdine, getProssimoNumeroOrdine,
} from '@/actions/produzione'
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

  const [ordini, fornitori, numeroProposto] = await Promise.all([
    getOrdiniCommessa(commessaId),
    getFornitoriPerOrdine(),
    getProssimoNumeroOrdine(),
  ])

  return (
    <ProduzioneCommessa
      commessa={commessa}
      ordini={ordini}
      fornitori={fornitori}
      numeroProposto={numeroProposto}
    />
  )
}
