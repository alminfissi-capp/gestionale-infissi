import { getClienti } from '@/actions/clienti'
import { getSettings } from '@/actions/impostazioni'
import { requireAccesso } from '@/lib/permessi'
import TabellaClienti from '@/components/clienti/TabellaClienti'

export default async function ClientiPage() {
  await requireAccesso('clienti')
  const [clienti, settings] = await Promise.all([getClienti(), getSettings()])
  const denominazione = settings?.denominazione || 'A.L.M. Infissi'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestione Clienti</h1>
        <p className="text-sm text-gray-500 mt-1">
          {clienti.length === 0
            ? 'Nessun cliente in anagrafica'
            : `${clienti.length} client${clienti.length === 1 ? 'e' : 'i'} in anagrafica`}
        </p>
      </div>
      <TabellaClienti clienti={clienti} denominazione={denominazione} />
    </div>
  )
}
