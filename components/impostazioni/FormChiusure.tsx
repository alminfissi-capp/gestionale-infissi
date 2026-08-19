// components/impostazioni/FormChiusure.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Plus, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  createChiusura, createChiusureMultiple, deleteChiusura,
} from '@/actions/calendario'
import { ANNO_RICORRENTE, FESTIVITA_ITALIANE, MESI } from '@/types/calendario'
import type { Chiusura } from '@/types/calendario'

const GIORNI = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

const formattaData = (data: string) => data.split('-').reverse().join('/')
/** Di una ricorrente si mostrano solo giorno e mese: l'anno non ha significato. */
const formattaGiornoMese = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

function etichettaPeriodo(c: Chiusura): string {
  const mostra = c.ricorrente ? formattaGiornoMese : formattaData
  return c.data_inizio === c.data_fine
    ? mostra(c.data_inizio)
    : `${mostra(c.data_inizio)} – ${mostra(c.data_fine)}`
}

/** Coppia giorno + mese: per le festivita' l'anno non si chiede. */
function SelettoreGiornoMese({
  id,
  giorno,
  mese,
  onGiorno,
  onMese,
}: {
  id: string
  giorno: string
  mese: string
  onGiorno: (v: string) => void
  onMese: (v: string) => void
}) {
  return (
    <div className="flex gap-1">
      <Select value={giorno} onValueChange={onGiorno}>
        <SelectTrigger id={id} className="w-20">
          <SelectValue placeholder="gg" />
        </SelectTrigger>
        <SelectContent>
          {GIORNI.map((g) => (
            <SelectItem key={g} value={g}>{g}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mese} onValueChange={onMese}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="mese" />
        </SelectTrigger>
        <SelectContent>
          {MESI.map((nome, i) => (
            <SelectItem key={nome} value={String(i + 1).padStart(2, '0')}>
              {nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function FormChiusure({ chiusure }: { chiusure: Chiusura[] }) {
  const router = useRouter()
  const [ricorrente, setRicorrente] = useState(true)
  const [giornoInizio, setGiornoInizio] = useState('')
  const [meseInizio, setMeseInizio] = useState('')
  const [giornoFine, setGiornoFine] = useState('')
  const [meseFine, setMeseFine] = useState('')
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [loading, setLoading] = useState(false)

  const svuota = () => {
    setGiornoInizio('')
    setMeseInizio('')
    setGiornoFine('')
    setMeseFine('')
    setDataInizio('')
    setDataFine('')
    setDescrizione('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descrizione.trim()) {
      toast.error('Serve una descrizione')
      return
    }

    let inizio: string
    let fine: string
    if (ricorrente) {
      if (!giornoInizio || !meseInizio) {
        toast.error('Scegli giorno e mese')
        return
      }
      inizio = `${ANNO_RICORRENTE}-${meseInizio}-${giornoInizio}`
      fine = giornoFine && meseFine
        ? `${ANNO_RICORRENTE}-${meseFine}-${giornoFine}`
        : inizio
    } else {
      if (!dataInizio) {
        toast.error('Scegli la data')
        return
      }
      inizio = dataInizio
      fine = dataFine || dataInizio
    }

    setLoading(true)
    try {
      await createChiusura({
        data_inizio: inizio,
        data_fine: fine,
        descrizione: descrizione.trim(),
        ricorrente,
      })
      svuota()
      toast.success('Chiusura aggiunta')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const handleFestivita = async () => {
    setLoading(true)
    try {
      const aggiunte = await createChiusureMultiple(
        FESTIVITA_ITALIANE.map((f) => ({
          data_inizio: `${ANNO_RICORRENTE}-${f.giornoMese}`,
          data_fine: `${ANNO_RICORRENTE}-${f.giornoMese}`,
          descrizione: f.descrizione,
          ricorrente: true,
        }))
      )
      toast.success(
        aggiunte === 0 ? 'Erano già tutte presenti' : `Aggiunte ${aggiunte} festività`
      )
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
                <span className="font-medium">{etichettaPeriodo(c)}</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">
                  {c.descrizione}
                </span>
                {c.ricorrente && (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    ogni anno
                  </span>
                )}
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

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={ricorrente}
            onCheckedChange={(v) => setRicorrente(v === true)}
          />
          Si ripete ogni anno (festività: bastano giorno e mese)
        </label>

        <div className="flex flex-wrap items-end gap-2">
          {ricorrente ? (
            <>
              <div>
                <Label htmlFor="chiusura-giorno-inizio">Dal</Label>
                <SelettoreGiornoMese
                  id="chiusura-giorno-inizio"
                  giorno={giornoInizio}
                  mese={meseInizio}
                  onGiorno={setGiornoInizio}
                  onMese={setMeseInizio}
                />
              </div>
              <div>
                <Label htmlFor="chiusura-giorno-fine">Al (facoltativo)</Label>
                <SelettoreGiornoMese
                  id="chiusura-giorno-fine"
                  giorno={giornoFine}
                  mese={meseFine}
                  onGiorno={setGiornoFine}
                  onMese={setMeseFine}
                />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="min-w-48 flex-1">
            <Label htmlFor="chiusura-descrizione">Descrizione</Label>
            <Input
              id="chiusura-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder={ricorrente ? 'Natale' : 'Ferie estive'}
            />
          </div>

          <Button type="submit" disabled={loading}>
            <Plus className="mr-1 h-4 w-4" />
            Aggiungi
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleFestivita}>
          <CalendarPlus className="mr-1 h-4 w-4" />
          Aggiungi le festività italiane
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Pasqua e Pasquetta cambiano data ogni anno: vanno aggiunte a mano, togliendo la spunta.
        </span>
      </div>
    </div>
  )
}
