import {
  getTuttiGliOrdini, getFornitoriPerOrdine, getCommessePerOrdine, getProssimoNumeroOrdine,
} from '@/actions/produzione'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import { getTrackingOrdini } from '@/actions/produzione-tracking'
import ElencoOrdini from '@/components/produzione/ElencoOrdini'

export const dynamic = 'force-dynamic'

export default async function OrdiniMagazzinoPage() {
  const [ordini, fornitori, commesse, numeroProposto, settings] = await Promise.all([
    getTuttiGliOrdini(),
    getFornitoriPerOrdine(),
    getCommessePerOrdine(),
    getProssimoNumeroOrdine(),
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ordini fornitori</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ordini di magazzino e di commessa
        </p>
      </div>

      <ElencoOrdini
        ordini={ordini}
        fornitori={fornitori}
        commesse={commesse}
        numeroProposto={numeroProposto}
        intestazione={intestazione}
        tracking={tracking}
      />
    </div>
  )
}
