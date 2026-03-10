import { notFound } from 'next/navigation'
import { getPreventivo } from '@/actions/preventivi'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import StampaPreventivo from '@/components/preventivi/StampaPreventivo'

interface Props {
  params: Promise<{ id: string }>
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
