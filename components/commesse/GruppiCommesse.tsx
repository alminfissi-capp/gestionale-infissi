'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Plus, FolderOpen } from 'lucide-react'
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
import type { GruppoCommesse } from '@/types/commessa'

export type GruppoConStats = GruppoCommesse & { count: number; totale: number }

interface Props {
  gruppi: GruppoConStats[]
}

export default function GruppiCommesse({ gruppi }: Props) {
  const router = useRouter()
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null)
  const [gruppoSelezionato, setGruppoSelezionato] = useState<GruppoCommesse | null>(null)

  async function handleDelete(g: GruppoConStats) {
    if (g.count > 0) {
      toast.error('Sposta prima le commesse in un altro blocco')
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

  function openRename(e: React.MouseEvent, g: GruppoCommesse) {
    e.stopPropagation()
    setGruppoSelezionato(g)
    setDialogMode('rename')
  }

  function openDelete(e: React.MouseEvent, g: GruppoConStats) {
    e.stopPropagation()
    handleDelete(g)
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() => { setGruppoSelezionato(null); setDialogMode('create') }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo blocco
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gruppi.map((g) => (
          <Card
            key={g.id}
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
                <span className="text-sm">{g.count} commesse</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-gray-900">
                {formatEuro(g.totale)}
              </p>
            </CardContent>
          </Card>
        ))}

        {gruppi.length === 0 && (
          <p className="text-gray-400 col-span-full text-center py-12">
            Nessun blocco. Creane uno per iniziare.
          </p>
        )}
      </div>

      <DialogGruppo
        open={dialogMode !== null}
        mode={dialogMode ?? 'create'}
        gruppo={gruppoSelezionato}
        onClose={() => setDialogMode(null)}
      />
    </>
  )
}
