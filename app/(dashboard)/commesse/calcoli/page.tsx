import Link from 'next/link'
import { ChevronRight, Star } from 'lucide-react'
import { getCommesseCalcoli, getGruppiCommesse, getRigheCalcoli, getIncassiAttesa } from '@/actions/commesse'
import { getScadenzeCalcoli } from '@/actions/scadenze'
import { getConti } from '@/actions/conti'
import { getLineeCredito, getAnticipi, getCommessePerAnticipo } from '@/actions/banche'
import TabellaCalcoli from '@/components/commesse/TabellaCalcoli'
import IncassiAttesa from '@/components/commesse/IncassiAttesa'
import BloccoFidi from '@/components/commesse/BloccoFidi'

export default async function CalcoliPage() {
  const [commesse, gruppi, righe, scadenze, conti, incassi, linee, anticipi, opzioniCommesse] =
    await Promise.all([
      getCommesseCalcoli(),
      getGruppiCommesse(),
      getRigheCalcoli(),
      getScadenzeCalcoli(),
      getConti(),
      getIncassiAttesa(),
      getLineeCredito(),
      getAnticipi(),
      getCommessePerAnticipo(),
    ])

  // Data locale italiana, non UTC: il confine dello "scaduto" non deve saltare di un giorno.
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

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
      <div className="space-y-6">
        <IncassiAttesa incassi={incassi} />
        <TabellaCalcoli commesse={commesse} gruppi={gruppi} righe={righe} scadenze={scadenze} conti={conti} />
        <BloccoFidi linee={linee} anticipi={anticipi} commesse={opzioniCommesse} oggi={oggi} />
      </div>
    </div>
  )
}
