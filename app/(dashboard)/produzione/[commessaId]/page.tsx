import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import {
  getCommessaProduzione, getOrdiniCommessa, getFornitoriPerOrdine, getProssimoNumeroOrdine,
} from '@/actions/produzione'
import { getDocumentiProduzione } from '@/actions/produzione-documenti'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import { getTrackingOrdini } from '@/actions/produzione-tracking'
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

  const tracking = await getTrackingOrdini(ordini.map((o) => o.id))

  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  const intestazione = {
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
    indirizzo: settings?.indirizzo ?? '',
    piva: settings?.piva ?? '',
    logoUrl,
  }

  return (
    <ProduzioneCommessa
      commessa={commessa}
      ordini={ordini}
      fornitori={fornitori}
      numeroProposto={numeroProposto}
      documenti={documenti}
      intestazione={intestazione}
      tracking={tracking}
    />
  )
}
