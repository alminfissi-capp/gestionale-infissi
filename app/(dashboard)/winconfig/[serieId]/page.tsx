import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSerieCompleta } from '@/actions/winconfig'
import SerieDetailClient from '@/components/winconfig/SerieDetailClient'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function SerieDetailPage({
  params,
}: {
  params: Promise<{ serieId: string }>
}) {
  const { serieId } = await params
  const serie = await getSerieCompleta(serieId)
  if (!serie) notFound()

  const MATERIALE_LABEL: Record<string, string> = {
    alluminio: 'Alluminio',
    pvc: 'PVC',
    legno_alluminio: 'Legno-Alluminio',
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/winconfig" className="flex items-center gap-1 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" />WinConfig
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">{serie.nome}</span>
      </div>

      {/* Header serie */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{serie.nome}</h1>
            {serie.descrizione && <p className="text-slate-500 text-sm mt-0.5">{serie.descrizione}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{MATERIALE_LABEL[serie.materiale] ?? serie.materiale}</Badge>
            <Badge variant={serie.attiva ? 'default' : 'secondary'}>
              {serie.attiva ? 'Attiva' : 'Inattiva'}
            </Badge>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm text-slate-600">
          <div>
            <span className="text-xs text-slate-400 block">Sfrido nodo</span>
            <strong>{serie.sfrido_nodo_mm} mm</strong>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Sfrido angolo</span>
            <strong>{serie.sfrido_angolo_mm} mm</strong>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Barra standard</span>
            <strong>{(serie.lunghezza_barra_mm / 1000).toFixed(1)} m</strong>
          </div>
        </div>
      </div>

      {/* Tab editor */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <SerieDetailClient serie={serie} />
      </div>
    </div>
  )
}
