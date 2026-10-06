import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import { getDatiFirmaConferma } from '@/actions/conferme-ordine'
import FirmaConferma from '@/components/produzione/FirmaConferma'

export const dynamic = 'force-dynamic'

export default async function PaginaFirmaConferma({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAccesso('produzione')
  const { id } = await params
  const dati = await getDatiFirmaConferma(id)
  if (!dati) notFound()
  return <FirmaConferma dati={dati} />
}
