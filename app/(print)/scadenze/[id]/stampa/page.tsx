import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getScadenzaScheda } from '@/actions/scadenze'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import SchedaScadenzaStampa from '@/components/commesse/SchedaScadenzaStampa'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const scheda = await getScadenzaScheda(id)
  if (!scheda) return { title: 'Scadenza' }
  const { scadenza } = scheda
  const [y, m, d] = scadenza.data_scadenza.split('-')
  const titolo = scadenza.fornitore || scadenza.descrizione || 'Scadenza'
  return { title: `Scadenza ${titolo} - ${d}.${m}.${y.slice(2)}` }
}

export default async function StampaScadenzaPage({ params }: Props) {
  const { id } = await params

  const [scheda, settings] = await Promise.all([
    getScadenzaScheda(id),
    getSettings(),
  ])

  if (!scheda) notFound()

  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  return (
    <SchedaScadenzaStampa
      scadenza={scheda.scadenza}
      contoNome={scheda.contoNome}
      gruppoNome={scheda.gruppoNome}
      fotoUrl={scheda.fotoUrl}
      settings={settings}
      logoUrl={logoUrl}
    />
  )
}
