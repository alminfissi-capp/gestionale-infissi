import { Factory } from 'lucide-react'
import { requireAccesso } from '@/lib/permessi'

export const dynamic = 'force-dynamic'

export default async function ProduzionePage() {
  await requireAccesso('produzione')

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Factory className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Produzione</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Documenti, file e ordini fornitori delle commesse
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sezione in costruzione.
        </p>
      </div>
    </div>
  )
}
