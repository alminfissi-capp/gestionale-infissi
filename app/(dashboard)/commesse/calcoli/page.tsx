import Link from 'next/link'
import { ChevronRight, Star } from 'lucide-react'
import { getCommesseCalcoli, getGruppiCommesse } from '@/actions/commesse'
import TabellaCalcoli from '@/components/commesse/TabellaCalcoli'

export default async function CalcoliPage() {
  const [commesse, gruppi] = await Promise.all([
    getCommesseCalcoli(),
    getGruppiCommesse(),
  ])

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
          <Link href="/commesse" className="hover:text-gray-700">Commesse</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-gray-900 font-medium">Calcoli</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
          Calcoli
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Commesse selezionate per il calcolo degli incassi possibili a fine mese
        </p>
      </div>
      <TabellaCalcoli commesse={commesse} gruppi={gruppi} />
    </div>
  )
}
