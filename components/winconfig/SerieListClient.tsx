'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Settings, Trash2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { deleteSerie } from '@/actions/winconfig'
import DialogSerie from './DialogSerie'
import type { WcSerie } from '@/types/winconfig'

const MATERIALE_LABEL: Record<string, string> = {
  alluminio: 'Alluminio',
  pvc: 'PVC',
  legno_alluminio: 'Legno-Al',
}

export default function SerieListClient({ serie }: { serie: WcSerie[] }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSerie, setEditSerie] = useState<WcSerie | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSerie(deleteId)
      toast.success('Serie eliminata')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">WinConfig — Serie profili</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gestisci le serie di profili con i relativi profili, accessori, colori e riempimenti.
          </p>
        </div>
        <Button onClick={() => { setEditSerie(undefined); setDialogOpen(true) }}>
          <Plus className="w-4 h-4 mr-2" />Nuova serie
        </Button>
      </div>

      {serie.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500 font-medium">Nessuna serie configurata</p>
          <p className="text-slate-400 text-sm mt-1">Crea la prima serie per iniziare a configurare serramenti.</p>
          <Button className="mt-4" onClick={() => { setEditSerie(undefined); setDialogOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" />Crea serie
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium">Serie</th>
                <th className="text-left px-4 py-3 font-medium">Materiale</th>
                <th className="text-right px-4 py-3 font-medium">Sfrido nodo</th>
                <th className="text-right px-4 py-3 font-medium">Sfrido angolo</th>
                <th className="text-right px-4 py-3 font-medium">Barra std.</th>
                <th className="text-center px-4 py-3 font-medium">Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {serie.map(s => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/winconfig/${s.id}`} className="font-medium text-slate-800 hover:text-blue-600 flex items-center gap-1">
                      {s.nome}<ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                    {s.descrizione && <p className="text-xs text-slate-400 mt-0.5">{s.descrizione}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{MATERIALE_LABEL[s.materiale] ?? s.materiale}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.sfrido_nodo_mm} mm</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.sfrido_angolo_mm} mm</td>
                  <td className="px-4 py-3 text-right text-slate-600">{(s.lunghezza_barra_mm / 1000).toFixed(1)} m</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={s.attiva ? 'default' : 'secondary'}>
                      {s.attiva ? 'Attiva' : 'Inattiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditSerie(s); setDialogOpen(true) }}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogSerie open={dialogOpen} onOpenChange={setDialogOpen} serie={editSerie} />

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina serie?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati anche tutti i profili, accessori, colori e riempimenti associati.
              Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
