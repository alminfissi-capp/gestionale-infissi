import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPreventivo } from '@/actions/preventivi'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import StampaPreventivo from '@/components/preventivi/StampaPreventivo'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const preventivo = await getPreventivo(id)
  if (!preventivo) return {}
  const s = preventivo.cliente_snapshot
  const nomeCliente =
    s.tipo === 'azienda'
      ? s.ragione_sociale || s.email || s.telefono || ''
      : [s.nome, s.cognome].filter(Boolean).join(' ') || s.email || s.telefono || ''
  const title = preventivo.numero
    ? `${preventivo.numero} ${nomeCliente}`.trim()
    : nomeCliente || 'Preventivo'
  return { title }
}

export default async function StampaPage({ params }: Props) {
  const { id } = await params

  const [preventivo, settings] = await Promise.all([
    getPreventivo(id),
    getSettings(),
  ])

  if (!preventivo) notFound()

  const logoUrl =
    settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  return (
    <StampaPreventivo
      preventivo={preventivo}
      settings={settings}
      logoUrl={logoUrl}
    />
  )
}
