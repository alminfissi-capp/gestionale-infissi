import { notFound } from 'next/navigation'
import { getPreventivo } from '@/actions/preventivi'
import DettaglioPreventivo from '@/components/preventivi/DettaglioPreventivo'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}

// `?from=/commesse/<blocco>` → il tasto indietro riporta alla pagina di provenienza
function backLink(from?: string): { href: string; label: string } {
  if (from && /^\/[A-Za-z0-9/_-]*$/.test(from)) {
    if (from.startsWith('/commesse')) return { href: from, label: 'Commesse' }
    return { href: from, label: 'Indietro' }
  }
  return { href: '/preventivi', label: 'Preventivi' }
}

export default async function DettaglioPreventivoPage({ params, searchParams }: Props) {
  const { id } = await params
  const { from } = await searchParams
  const preventivo = await getPreventivo(id)
  if (!preventivo) notFound()

  const back = backLink(from)

  return <DettaglioPreventivo preventivo={preventivo} backHref={back.href} backLabel={back.label} />
}
