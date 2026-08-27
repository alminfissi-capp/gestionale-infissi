'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Check } from 'lucide-react'
import {
  createLineaCredito, updateLineaCredito, deleteLineaCredito,
} from '@/actions/banche'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LABEL_TIPO_LINEA, type LineaCredito, type TipoLineaCredito } from '@/types/commessa'

interface Props {
  initialLinee: LineaCredito[]
  conteggioAnticipi: Record<string, number> // linea_id → quanti anticipi aperti o chiusi
}

type Riga = LineaCredito & { nomeSalvato: string; tipoSalvato: TipoLineaCredito; accordatoSalvato: number }
const toRow = (l: LineaCredito): Riga => ({
  ...l, nomeSalvato: l.nome, tipoSalvato: l.tipo, accordatoSalvato: l.accordato,
})

const parseImporto = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

const TIPI = Object.keys(LABEL_TIPO_LINEA) as TipoLineaCredito[]

export default function FormLineeCredito({ initialLinee, conteggioAnticipi }: Props) {
  const [linee, setLinee] = useState<Riga[]>(() => initialLinee.map(toRow))
  const [importiStr, setImportiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLinee.map((l) => [l.id, String(l.accordato)]))
  )
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoTipo, setNuovoTipo] = useState<TipoLineaCredito>('anticipo_fatture')
  const [nuovoAccordato, setNuovoAccordato] = useState('')
  const [adding, setAdding] = useState(false)

  const handleSalva = async (id: string) => {
    const l = linee.find((x) => x.id === id)
    if (!l) return
    const accordato = parseImporto(importiStr[id] ?? '')
    if (l.nome.trim() === l.nomeSalvato && l.tipo === l.tipoSalvato && accordato === l.accordatoSalvato) return
    if (!l.nome.trim()) { toast.error('Il nome della linea è obbligatorio'); return }
    try {
      await updateLineaCredito(id, { nome: l.nome, tipo: l.tipo, accordato })
      setLinee((cur) => cur.map((x) => (x.id === id
        ? { ...x, accordato, nomeSalvato: x.nome.trim(), tipoSalvato: x.tipo, accordatoSalvato: accordato }
        : x)))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  // La cancellazione porta via gli anticipi (ON DELETE CASCADE): va detto, e va detto quanti.
  const handleDelete = async (id: string) => {
    const quanti = conteggioAnticipi[id] ?? 0
    const avviso = quanti > 0
      ? `Eliminare questa linea? Verranno eliminati anche i suoi ${quanti} anticipi, compresi quelli ancora aperti.`
      : 'Eliminare questa linea di credito?'
    if (!confirm(avviso)) return
    const prev = linee
    setLinee((cur) => cur.filter((l) => l.id !== id))
    try {
      await deleteLineaCredito(id)
    } catch {
      setLinee(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleAdd = async () => {
    if (!nuovoNome.trim()) { toast.error('Inserisci il nome della linea'); return }
    setAdding(true)
    try {
      const accordato = parseImporto(nuovoAccordato)
      const { id } = await createLineaCredito({ nome: nuovoNome, tipo: nuovoTipo, accordato })
      const nuova: LineaCredito = {
        id, organization_id: '', nome: nuovoNome.trim(), tipo: nuovoTipo, accordato,
        ordine: 0, created_at: '', updated_at: '',
      }
      setLinee((cur) => [...cur, toRow(nuova)])
      setImportiStr((cur) => ({ ...cur, [id]: String(accordato) }))
      setNuovoNome('')
      setNuovoAccordato('')
      toast.success('Linea aggiunta')
    } catch {
      toast.error("Errore nell'aggiunta della linea")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      {linee.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessuna linea configurata. Aggiungine una per registrare gli anticipi fattura dai Calcoli.
        </p>
      )}

      {linee.map((l) => {
        const dirty =
          l.nome.trim() !== l.nomeSalvato ||
          l.tipo !== l.tipoSalvato ||
          parseImporto(importiStr[l.id] ?? '') !== l.accordatoSalvato
        return (
          <div key={l.id} className="flex items-center gap-2">
            <Input
              value={l.nome}
              placeholder="Nome linea (es. Anticipo fatture Intesa)"
              onChange={(e) => setLinee((cur) => cur.map((x) => (x.id === l.id ? { ...x, nome: e.target.value } : x)))}
              onBlur={() => handleSalva(l.id)}
              className="flex-1"
            />
            <Select
              value={l.tipo}
              onValueChange={(v) => {
                setLinee((cur) => cur.map((x) => (x.id === l.id ? { ...x, tipo: v as TipoLineaCredito } : x)))
              }}
            >
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI.map((t) => (
                  <SelectItem key={t} value={t}>{LABEL_TIPO_LINEA[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-36 shrink-0">
              <Input
                type="number"
                step={0.01}
                value={importiStr[l.id] ?? ''}
                placeholder="Plafond 0,00"
                onChange={(e) => setImportiStr((cur) => ({ ...cur, [l.id]: e.target.value }))}
                onBlur={() => handleSalva(l.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="text-right pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
            </div>
            {dirty && (
              <Button
                variant="ghost"
                size="icon"
                className="text-emerald-600 hover:text-emerald-700 shrink-0"
                title="Salva"
                onClick={() => handleSalva(l.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-red-600 shrink-0"
              title="Elimina"
              onClick={() => handleDelete(l.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <div className="flex items-center gap-2 border-t pt-3">
        <Input
          value={nuovoNome}
          placeholder="Nuova linea (es. Anticipo fatture Intesa)"
          onChange={(e) => setNuovoNome(e.target.value)}
          className="flex-1"
        />
        <Select value={nuovoTipo} onValueChange={(v) => setNuovoTipo(v as TipoLineaCredito)}>
          <SelectTrigger className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPI.map((t) => (
              <SelectItem key={t} value={t}>{LABEL_TIPO_LINEA[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-36 shrink-0">
          <Input
            type="number"
            step={0.01}
            value={nuovoAccordato}
            placeholder="Plafond 0,00"
            onChange={(e) => setNuovoAccordato(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            className="text-right pr-7"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          {adding ? '...' : 'Aggiungi'}
        </Button>
      </div>
    </div>
  )
}
