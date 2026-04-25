import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getCategorieMagazzino } from '@/actions/magazzino'
import type { TipoCategoriaMagazzino } from '@/types/magazzino'
import { TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

const MACRO_CONFIG: Record<TipoCategoriaMagazzino, { color: string; bg: string; border: string }> = {
  alluminio: { color: 'text-blue-700', bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-200 hover:border-blue-400' },
  ferro:     { color: 'text-slate-700', bg: 'bg-slate-50 hover:bg-slate-100', border: 'border-slate-300 hover:border-slate-500' },
  accessori: { color: 'text-purple-700', bg: 'bg-purple-50 hover:bg-purple-100', border: 'border-purple-200 hover:border-purple-400' },
  pannelli:  { color: 'text-green-700', bg: 'bg-green-50 hover:bg-green-100', border: 'border-green-200 hover:border-green-400' },
  chimici:   { color: 'text-orange-700', bg: 'bg-orange-50 hover:bg-orange-100', border: 'border-orange-200 hover:border-orange-400' },
  viteria:   { color: 'text-amber-700', bg: 'bg-amber-50 hover:bg-amber-100', border: 'border-amber-200 hover:border-amber-400' },
}

export default async function CategorieMagazzinoPage() {
  const tutte = await getCategorieMagazzino()

  const conteggioPerTipo = (tipo: TipoCategoriaMagazzino) =>
    tutte.filter((c) => c.tipo === tipo).length

  const tipi = Object.keys(TIPO_CATEGORIA_LABELS) as TipoCategoriaMagazzino[]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Categorie</h1>
        <p className="text-sm text-gray-500 mt-1">Seleziona un tipo di materiale per gestire le sottocategorie</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {tipi.map((tipo) => {
          const cfg = MACRO_CONFIG[tipo]
          const count = conteggioPerTipo(tipo)
          return (
            <Link
              key={tipo}
              href={`/magazzino/categorie/${tipo}`}
              className={`group flex flex-col items-center justify-center gap-3 rounded-xl border-2 p-6 transition-colors ${cfg.bg} ${cfg.border}`}
            >
              <span className={`text-base font-semibold text-center leading-tight ${cfg.color}`}>
                {TIPO_CATEGORIA_LABELS[tipo]}
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                {count === 0 ? 'Nessuna sottocategoria' : `${count} sottocategor${count === 1 ? 'ia' : 'ie'}`}
                <ChevronRight className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
