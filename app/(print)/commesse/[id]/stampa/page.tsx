import { notFound } from 'next/navigation'
import { getCommessaById, getDocumentoCommessaUrl } from '@/actions/commesse'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import StampaCommessa from '@/components/commesse/StampaCommessa'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ docs?: string }>
}

export default async function StampaCommessaPage({ params, searchParams }: Props) {
  const { id } = await params
  const { docs } = await searchParams
  const selectedDocIds = docs ? docs.split(',').filter(Boolean) : []

  const [commessa, settings] = await Promise.all([
    getCommessaById(id),
    getSettings(),
  ])

  if (!commessa) notFound()

  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  const selectedDocs = commessa.documenti.filter((d) => selectedDocIds.includes(d.id))
  const docUrls: Record<string, string> = {}
  await Promise.all(
    selectedDocs.map(async (doc) => {
      try { docUrls[doc.id] = await getDocumentoCommessaUrl(doc.storage_path) } catch { /* ignora */ }
    })
  )

  return (
    <StampaCommessa
      commessa={commessa}
      settings={settings}
      logoUrl={logoUrl}
      selectedDocIds={selectedDocIds}
      docUrls={docUrls}
    />
  )
}
