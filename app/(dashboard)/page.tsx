import { redirect } from 'next/navigation'
import { getDashboardData } from '@/actions/dashboard'
import { getMyPermissions, primoModuloAccessibile } from '@/lib/permessi'
import DashboardPage from '@/components/dashboard/DashboardPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { isAdmin, permessi } = await getMyPermissions()

  // La dashboard è un modulo permesso: chi non ce l'ha viene mandato alla
  // prima sezione a cui ha accesso (mai a '/', per evitare loop).
  if (!isAdmin && permessi.dashboard === 'nessuno') {
    const landing = primoModuloAccessibile(permessi)
    if (landing) redirect(landing)

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Nessun accesso
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Non hai accesso ad alcuna sezione. Contatta un amministratore per abilitare i permessi.
          </p>
        </div>
      </div>
    )
  }

  const data = await getDashboardData()
  return <DashboardPage data={data} />
}
