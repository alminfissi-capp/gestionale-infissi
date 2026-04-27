import { redirect } from 'next/navigation'
import { getMyPermissions } from '@/lib/permessi'
import { getUtenti } from '@/actions/utenti'
import GestioneUtenti from '@/components/utenti/GestioneUtenti'

export default async function GestioneUtentiPage() {
  const { isAdmin } = await getMyPermissions()
  if (!isAdmin) redirect('/')

  const utenti = await getUtenti()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
        <p className="text-sm text-gray-500 mt-1">
          Crea account operatore e configura i permessi di accesso per modulo
        </p>
      </div>
      <GestioneUtenti initialUtenti={utenti} />
    </div>
  )
}
