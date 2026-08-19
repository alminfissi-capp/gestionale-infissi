// components/impostazioni/FormChiusure.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createChiusura, deleteChiusura } from '@/actions/calendario'
import type { Chiusura } from '@/types/calendario'

const formatta = (data: string) => data.split('-').reverse().join('/')

export default function FormChiusure({ chiusure }: { chiusure: Chiusura[] }) {
  const router = useRouter()
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dataInizio || !descrizione.trim()) {
      toast.error('Servono almeno la data e una descrizione')
      return
    }
    setLoading(true)
    try {
      await createChiusura({
        data_inizio: dataInizio,
        data_fine: dataFine || dataInizio,
        descrizione: descrizione.trim(),
      })
      setDataInizio('')
      setDataFine('')
      setDescrizione('')
      toast.success('Chiusura aggiunta')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteChiusura(id)
      toast.success('Chiusura rimossa')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  return (
    <div className="space-y-4">
      {chiusure.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nessuna chiusura impostata.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {chiusure.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span className="text-sm">
                <span className="font-medium">
                  {formatta(c.data_inizio)}
                  {c.data_fine !== c.data_inizio && ` – ${formatta(c.data_fine)}`}
                </span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">
                  {c.descrizione}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(c.id)}
                aria-label={`Rimuovi ${c.descrizione}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="chiusura-inizio">Dal</Label>
          <Input
            id="chiusura-inizio"
            type="date"
            value={dataInizio}
            onChange={(e) => setDataInizio(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="chiusura-fine">Al (facoltativo)</Label>
          <Input
            id="chiusura-fine"
            type="date"
            value={dataFine}
            onChange={(e) => setDataFine(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1 min-w-48">
          <Label htmlFor="chiusura-descrizione">Descrizione</Label>
          <Input
            id="chiusura-descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Ferie estive"
          />
        </div>
        <Button type="submit" disabled={loading}>
          <Plus className="mr-1 h-4 w-4" />
          Aggiungi
        </Button>
      </form>
    </div>
  )
}
