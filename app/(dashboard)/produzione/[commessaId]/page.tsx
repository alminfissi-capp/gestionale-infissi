import { notFound } from 'next/navigation'
import { requireAccesso, getMyPermissions } from '@/lib/permessi'
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
  searchParams,
}: {
  params: Promise<{ commessaId: string }>
  // `da=commesse` dice che si e' arrivati qui dall'elenco economico.
  searchParams: Promise<{ da?: string }>
}) {
  await requireAccesso('produzione')
  const { commessaId } = await params
  const { da } = await searchParams

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

  // Il ritorno all'elenco economico compare solo a chi e' arrivato da li'. Il
  // parametro nell'indirizzo pero' se lo puo' scrivere chiunque, quindi da solo
  // non nasconde niente: la condizione che conta e' il permesso, verificato qui
  // sul server. Torna al blocco della commessa, evidenziando la riga di
  // partenza, cosi' si riprende esattamente da dove si era.
  const { permessi } = await getMyPermissions()
  const tornaACommesse =
    da === 'commesse' && permessi.commesse !== 'nessuno' && commessa.gruppo_id
      ? `/commesse/${commessa.gruppo_id}?highlight=${commessa.id}`
      : null

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
      tornaACommesse={tornaACommesse}
    />
  )
}
