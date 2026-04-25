import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getCategorieMagazzinoByTipo } from '@/actions/magazzino'
import TabellaCategorieMagazzino from '@/components/magazzino/TabellaCategorieMagazzino'
import type { TipoCategoriaMagazzino } from '@/types/magazzino'
import { TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

const VALID_TIPI: TipoCategoriaMagazzino[] = ['alluminio', 'ferro', 'accessori', 'pannelli', 'chimici', 'viteria']

export default async function SottocategoriePage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params

  if (!VALID_TIPI.includes(tipo as TipoCategoriaMagazzino)) notFound()

  const tipoValidato = tipo as TipoCategoriaMagazzino
  const categorie = await getCategorieMagazzinoByTipo(tipoValidato)

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/magazzino/categorie"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Categorie
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{TIPO_CATEGORIA_LABELS[tipoValidato]}</h1>
        <p className="text-sm text-gray-500 mt-1">Gestisci le sottocategorie di {TIPO_CATEGORIA_LABELS[tipoValidato].toLowerCase()}</p>
      </div>

      <TabellaCategorieMagazzino categorie={categorie} tipo={tipoValidato} />
    </div>
  )
}
