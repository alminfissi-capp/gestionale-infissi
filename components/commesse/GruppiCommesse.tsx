'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Plus, FolderOpen, Star, Briefcase, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteGruppo } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import DialogGruppo from './DialogGruppo'
import type { GruppoCommesse, TipoBlocco } from '@/types/commessa'

export type GruppoConStats = GruppoCommesse & { count: number; totale: number }

interface Props {
  gruppi: GruppoConStats[]
  calcoli?: { count: number; saldo: number }
}

export default function GruppiCommesse({ gruppi, calcoli }: Props) {
  const router = useRouter()
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null)
  const [dialogTipo, setDialogTipo] = useState<TipoBlocco>('commesse')
  const [gruppoSelezionato, setGruppoSelezionato] = useState<GruppoCommesse | null>(null)

  const commesseGruppi = gruppi.filter((g) => g.tipo !== 'scadenze')
  const scadenzeGruppi = gruppi.filter((g) => g.tipo === 'scadenze')

  async function handleDelete(g: GruppoConStats) {
    if (g.count > 0) {
      toast.error(g.tipo === 'scadenze'
        ? 'Elimina prima le scadenze del blocco'
        : 'Sposta prima le commesse in un altro blocco')
      return
    }
    try {
      await deleteGruppo(g.id)
      toast.success('Blocco eliminato')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function openCreate(tipo: TipoBlocco) {
    setGruppoSelezionato(null)
    setDialogTipo(tipo)
    setDialogMode('create')
  }

  function openRename(e: React.MouseEvent, g: GruppoCommesse) {
    e.stopPropagation()
    setGruppoSelezionato(g)
    setDialogMode('rename')
  }

  function openDelete(e: React.MouseEvent, g: GruppoConStats) {
    e.stopPropagation()
    handleDelete(g)
  }

  function BlockCard({ g }: { g: GruppoConStats }) {
    const isScad = g.tipo === 'scadenze'
    return (
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => router.push(`/commesse/${g.id}`)}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">{g.nome}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => openRename(e, g)}>
                Rinomina
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={g.count > 0}
                className="text-red-600 focus:text-red-600 disabled:opacity-40"
                onClick={(e) => openDelete(e, g)}
              >
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-gray-500">
            <FolderOpen className="h-4 w-4" />
            <span className="text-sm">
              {g.count} {isScad ? (g.count === 1 ? 'scadenza' : 'scadenze') : 'commesse'}
            </span>
          </div>
          <p className={`text-2xl font-bold mt-1 ${isScad ? 'text-rose-600' : 'text-gray-900'}`}>
            {formatEuro(g.totale)}
          </p>
          {isScad && <p className="text-xs text-gray-400 mt-0.5">Da pagare</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => openCreate('commesse')}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo blocco
        </Button>
      </div>

      {/* Slot Calcoli — sempre in cima, tutta larghezza */}
      {calcoli && (
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-amber-300 bg-amber-50/50"
          onClick={() => router.push('/commesse/calcoli')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
              Calcoli
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-gray-500">
                <FolderOpen className="h-4 w-4" />
                <span className="text-sm">{calcoli.count} commesse selezionate</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-amber-700">
                {formatEuro(calcoli.saldo)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Incasso possibile</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Due colonne: Commesse | Scadenze */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonna Commesse */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-semibold text-teal-700 flex items-center gap-2 uppercase tracking-wide">
              <Briefcase className="h-4 w-4" />
              Commesse
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-teal-700" onClick={() => openCreate('commesse')}>
              <Plus className="h-4 w-4 mr-1" />
              Blocco
            </Button>
          </div>
          {commesseGruppi.length > 0 ? (
            commesseGruppi.map((g) => <BlockCard key={g.id} g={g} />)
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Nessun blocco commesse.</p>
          )}
        </section>

        {/* Colonna Scadenze */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-semibold text-rose-700 flex items-center gap-2 uppercase tracking-wide">
              <CalendarClock className="h-4 w-4" />
              Scadenze
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-rose-700" onClick={() => openCreate('scadenze')}>
              <Plus className="h-4 w-4 mr-1" />
              Blocco
            </Button>
          </div>
          {scadenzeGruppi.length > 0 ? (
            scadenzeGruppi.map((g) => <BlockCard key={g.id} g={g} />)
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Nessun blocco scadenze.</p>
          )}
        </section>
      </div>

      <DialogGruppo
        open={dialogMode !== null}
        mode={dialogMode ?? 'create'}
        gruppo={gruppoSelezionato}
        initialTipo={dialogTipo}
        onClose={() => setDialogMode(null)}
      />
    </div>
  )
}
