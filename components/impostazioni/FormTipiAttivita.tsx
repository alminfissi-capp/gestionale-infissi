// components/impostazioni/FormTipiAttivita.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  createTipoAttivita, updateTipoAttivita, deleteTipoAttivita,
} from '@/actions/calendario'
import type { AmbitoTipo, TipoAttivita } from '@/types/calendario'

const AMBITI: { value: AmbitoTipo; label: string }[] = [
  { value: 'produzione', label: 'Produzione' },
  { value: 'amministrazione', label: 'Agenda' },
]

/** Nero o bianco, quello che si legge meglio sopra il colore scelto. */
function testoLeggibile(sfondo: string): string {
  const n = parseInt(sfondo.slice(1), 16)
  const luminosita = (
    0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  ) / 255
  return luminosita > 0.6 ? '#1F1F1F' : '#FFFFFF'
}

function RigaTipo({ tipo }: { tipo: TipoAttivita }) {
  const router = useRouter()
  const [etichetta, setEtichetta] = useState(tipo.etichetta)
  const [sfondo, setSfondo] = useState(tipo.sfondo)
  const [ambito, setAmbito] = useState<AmbitoTipo>(tipo.ambito)
  const [evidenzia, setEvidenzia] = useState(tipo.evidenzia_giorno)
  const [loading, setLoading] = useState(false)

  const modificato =
    etichetta !== tipo.etichetta ||
    sfondo !== tipo.sfondo ||
    ambito !== tipo.ambito ||
    evidenzia !== tipo.evidenzia_giorno

  const salva = async () => {
    setLoading(true)
    try {
      await updateTipoAttivita(tipo.id, {
        etichetta,
        sfondo,
        testo: testoLeggibile(sfondo),
        ambito,
        evidenzia_giorno: evidenzia,
      })
      toast.success('Attività aggiornata')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const elimina = async () => {
    setLoading(true)
    try {
      await deleteTipoAttivita(tipo.id)
      toast.success('Attività eliminata')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="color"
        value={sfondo}
        onChange={(e) => setSfondo(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-gray-200 dark:border-gray-700"
        aria-label={`Colore di ${tipo.etichetta}`}
      />
      <Input
        value={etichetta}
        onChange={(e) => setEtichetta(e.target.value)}
        className="h-8 w-44"
        aria-label={`Nome di ${tipo.etichetta}`}
      />
      <Select value={ambito} onValueChange={(v) => setAmbito(v as AmbitoTipo)}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AMBITI.map((a) => (
            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={evidenzia}
          onCheckedChange={(v) => setEvidenzia(v === true)}
        />
        Evidenzia il giorno
      </label>

      <span
        className="rounded-sm px-2 py-0.5 text-[11px]"
        style={{ backgroundColor: sfondo, color: testoLeggibile(sfondo) }}
      >
        {etichetta || 'Anteprima'}
      </span>

      <div className="ml-auto flex items-center gap-1">
        {modificato && (
          <Button type="button" size="sm" disabled={loading} onClick={salva}>
            Salva
          </Button>
        )}
        {!tipo.sistema && (
          <Button
            type="button" variant="ghost" size="sm" disabled={loading}
            onClick={elimina}
            aria-label={`Elimina ${tipo.etichetta}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Anagrafica delle attività del calendario: nome, colore, dove compaiono e se
 * colorano il riquadro del giorno nel Gantt. Gli eventi già inseriti restano
 * legati alla loro attività anche cambiandole nome.
 */
export default function FormTipiAttivita({ tipi }: { tipi: TipoAttivita[] }) {
  const router = useRouter()
  const [etichetta, setEtichetta] = useState('')
  const [sfondo, setSfondo] = useState('#6699CC')
  const [ambito, setAmbito] = useState<AmbitoTipo>('produzione')
  const [evidenzia, setEvidenzia] = useState(false)
  const [loading, setLoading] = useState(false)

  const aggiungi = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await createTipoAttivita({
        etichetta,
        sfondo,
        testo: testoLeggibile(sfondo),
        ambito,
        evidenzia_giorno: evidenzia,
      })
      setEtichetta('')
      setEvidenzia(false)
      toast.success('Attività aggiunta')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {tipi.map((t) => (
          <RigaTipo key={t.id} tipo={t} />
        ))}
      </ul>

      <form onSubmit={aggiungi} className="flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <div>
          <Label htmlFor="tipo-colore">Colore</Label>
          <input
            id="tipo-colore"
            type="color"
            value={sfondo}
            onChange={(e) => setSfondo(e.target.value)}
            className="block h-9 w-12 cursor-pointer rounded border border-gray-200 dark:border-gray-700"
          />
        </div>
        <div className="min-w-44 flex-1">
          <Label htmlFor="tipo-nome">Nuova attività</Label>
          <Input
            id="tipo-nome"
            value={etichetta}
            placeholder="Verniciatura"
            onChange={(e) => setEtichetta(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tipo-ambito">Dove</Label>
          <Select value={ambito} onValueChange={(v) => setAmbito(v as AmbitoTipo)}>
            <SelectTrigger id="tipo-ambito" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AMBITI.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox
            checked={evidenzia}
            onCheckedChange={(v) => setEvidenzia(v === true)}
          />
          Evidenzia il giorno
        </label>
        <Button type="submit" disabled={loading || !etichetta.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Aggiungi
        </Button>
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        &quot;Evidenzia il giorno&quot; colora il riquadro del numero nel calendario di
        produzione, come fa la posa. Un&apos;attività già usata da qualche evento non si
        elimina: prima vanno spostati o cancellati.
      </p>
    </div>
  )
}
