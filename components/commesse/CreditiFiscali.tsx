'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Check, Landmark, GripVertical } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  addCreditoFiscale,
  updateCreditoFiscale,
  setRecuperatoCreditoFiscale,
  deleteCreditoFiscale,
  riordinaCreditiFiscali,
} from '@/actions/commesse'
import { formatEuro, parseImporto, formatImporto } from '@/lib/pricing'
import { riepilogoCreditiFiscali, type AccontoRow } from '@/lib/statistiche-commesse'
import type { CreditoFiscale } from '@/types/commessa'

interface Props {
  acconti: AccontoRow[]
  creditiFiscali: CreditoFiscale[]
  oggi: string
}

type Riga = CreditoFiscale & { nomeSalvato: string }

const toRiga = (c: CreditoFiscale): Riga => ({ ...c, nomeSalvato: c.nome })

const initImporti = (list: CreditoFiscale[]) =>
  Object.fromEntries(list.map((c) => [c.id, c.importo ? formatImporto(c.importo) : '']))

const initAnni = (list: CreditoFiscale[]) =>
  Object.fromEntries(list.map((c) => [c.id, c.anno ? String(c.anno) : '']))

/** Anno scritto nella cella: valido solo fra 1990 e 2100, altrimenti resta vuoto. */
const leggiAnno = (raw: string): number | null => {
  const n = Number(raw.trim())
  return raw.trim() !== '' && Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null
}

/**
 * Card dei crediti fiscali: denaro gia' uscito che lo Stato deve restituire.
 *
 * Le ritenute d'acconto sono righe automatiche, calcolate dagli acconti: non si
 * inseriscono a mano, o finirebbero contate due volte. Tutto il resto (IVA a
 * credito, acconti d'imposta, crediti d'imposta) lo scrive l'utente, con l'anno
 * di riferimento, e le righe si riordinano trascinandole dalla maniglia.
 */
export default function CreditiFiscali({ acconti, creditiFiscali, oggi }: Props) {
  const [items, setItems] = useState<Riga[]>(() => creditiFiscali.map(toRiga))
  const [importi, setImporti] = useState<Record<string, string>>(() => initImporti(creditiFiscali))
  const [anni, setAnni] = useState<Record<string, string>>(() => initAnni(creditiFiscali))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Riallineamento ai dati del server dopo un refresh, senza useEffect
  const [prev, setPrev] = useState(creditiFiscali)
  if (prev !== creditiFiscali) {
    setPrev(creditiFiscali)
    setItems(creditiFiscali.map(toRiga))
    setImporti(initImporti(creditiFiscali))
    setAnni(initAnni(creditiFiscali))
  }

  // Le ritenute vengono dalla funzione pura, che e' anche l'unica cosa testata.
  const riepilogo = useMemo(
    () => riepilogoCreditiFiscali(acconti, [], oggi),
    [acconti, oggi],
  )

  // Le voci a mano si sommano dagli importi a schermo, cosi' il totale si muove
  // mentre si digita invece di aspettare il salvataggio.
  const manualiAdesso = items
    .filter((r) => !r.recuperato)
    .reduce((s, r) => s + parseImporto(importi[r.id] ?? ''), 0)
  const totale = riepilogo.ritenute + manualiAdesso

  const handleAdd = async () => {
    try {
      const nuovo = await addCreditoFiscale()
      setItems((cur) => [...cur, toRiga(nuovo)])
      setImporti((cur) => ({ ...cur, [nuovo.id]: '' }))
      setAnni((cur) => ({ ...cur, [nuovo.id]: '' }))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleSalva = async (id: string) => {
    const riga = items.find((r) => r.id === id)
    if (!riga) return
    const raw = (importi[id] ?? '').trim()
    const importo = parseImporto(raw)
    if (raw !== '') setImporti((cur) => ({ ...cur, [id]: formatImporto(importo) }))
    const anno = leggiAnno(anni[id] ?? '')
    setAnni((cur) => ({ ...cur, [id]: anno ? String(anno) : '' }))
    if (riga.nome === riga.nomeSalvato && importo === riga.importo && anno === riga.anno) return

    try {
      await updateCreditoFiscale(id, { nome: riga.nome, descrizione: riga.descrizione, importo, anno })
      setItems((cur) => cur.map((r) => (r.id === id ? { ...r, importo, anno, nomeSalvato: r.nome } : r)))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleToggle = async (riga: Riga) => {
    const nuovo = !riga.recuperato
    setItems((cur) => cur.map((r) => (r.id === riga.id ? { ...r, recuperato: nuovo } : r)))
    try {
      await setRecuperatoCreditoFiscale(riga.id, nuovo)
    } catch {
      setItems((cur) => cur.map((r) => (r.id === riga.id ? { ...r, recuperato: !nuovo } : r)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const precedenti = items
    const nuovi = arrayMove(
      items,
      items.findIndex((r) => r.id === active.id),
      items.findIndex((r) => r.id === over.id),
    )
    setItems(nuovi)
    try {
      await riordinaCreditiFiscali(nuovi.map((r) => r.id))
    } catch {
      setItems(precedenti)
      toast.error("Errore nel salvataggio dell'ordine")
    }
  }

  const handleDelete = async (id: string) => {
    const precedenti = items
    setItems((cur) => cur.filter((r) => r.id !== id))
    try {
      await deleteCreditoFiscale(id)
    } catch {
      setItems(precedenti)
      toast.error('Errore nella cancellazione')
    }
  }

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
      <p className="text-xs uppercase tracking-wide text-amber-800 font-medium">Crediti fiscali</p>
      <p className="text-2xl font-bold text-amber-800 mt-1">{formatEuro(totale)}</p>

      <div className="mt-2 space-y-1 text-xs">
        {/* Righe automatiche: si calcolano dagli acconti e non si modificano */}
        {riepilogo.ritenuteAnnoCorrente > 0 && (
          <div className="flex justify-between gap-2 text-gray-700">
            <span className="flex items-center gap-1.5 min-w-0">
              <Landmark className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="truncate">Crediti da ritenute {riepilogo.anno}</span>
            </span>
            <span className="shrink-0">{formatEuro(riepilogo.ritenuteAnnoCorrente)}</span>
          </div>
        )}
        {riepilogo.ritenuteAnnoPrecedente > 0 && (
          <div className="flex justify-between gap-2 text-gray-700">
            <span className="flex items-center gap-1.5 min-w-0">
              <Landmark className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="truncate">Crediti da ritenute {riepilogo.annoPrecedente}</span>
            </span>
            <span className="shrink-0">{formatEuro(riepilogo.ritenuteAnnoPrecedente)}</span>
          </div>
        )}
        {riepilogo.ritenute === 0 && (
          <p className="text-xs text-gray-500">
            Nessuna ritenuta registrata: si calcolano da sole dai pagamenti marcati
            come bonifico per detrazioni fiscali.
          </p>
        )}

        {/* Voci scritte a mano */}
        {items.length > 0 && (
          <div className="pt-1 border-t border-amber-200">
            <div className="flex items-center gap-1 pl-10 pr-7 pb-0.5 text-[10px] uppercase tracking-wide text-amber-800/70">
              <span className="flex-1">Descrizione</span>
              <span className="w-12 text-center">Anno</span>
              <span className="w-20 text-right pr-1.5">Importo</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {items.map((r) => (
                    <RigaCredito
                      key={r.id}
                      riga={r}
                      importo={importi[r.id] ?? ''}
                      anno={anni[r.id] ?? ''}
                      onNome={(nome) => setItems((cur) => cur.map((x) => (x.id === r.id ? { ...x, nome } : x)))}
                      onImporto={(v) => setImporti((cur) => ({ ...cur, [r.id]: v }))}
                      onAnno={(v) => setAnni((cur) => ({ ...cur, [r.id]: v }))}
                      onSalva={() => handleSalva(r.id)}
                      onToggle={() => handleToggle(r)}
                      onElimina={() => handleDelete(r.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full mt-1 bg-white" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi credito
        </Button>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Denaro gi&agrave; uscito che lo Stato deve restituire. Non entra nei crediti da
        incassare: si recupera in dichiarazione o in compensazione, non da un cliente.
      </p>
    </div>
  )
}

const invioSalva = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
}

function RigaCredito({
  riga: r, importo, anno, onNome, onImporto, onAnno, onSalva, onToggle, onElimina,
}: {
  riga: Riga
  importo: string
  anno: string
  onNome: (v: string) => void
  onImporto: (v: string) => void
  onAnno: (v: string) => void
  onSalva: () => void
  onToggle: () => void
  onElimina: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id })
  const barrato = r.recuperato ? 'line-through text-gray-400' : ''
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-1 rounded ${isDragging ? 'relative z-10 bg-amber-100 shadow-md' : ''}`}
    >
      {/* Maniglia: solo da qui si trascina, cosi' i campi restano cliccabili */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Trascina per spostare"
        aria-label="Trascina per spostare"
        className="mt-1 h-5 w-4 shrink-0 cursor-grab touch-none text-amber-700/60 hover:text-amber-800 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        title={r.recuperato ? 'Segna come ancora da recuperare' : 'Segna come recuperato'}
        className={`mt-1.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
          r.recuperato
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-gray-300 bg-white text-transparent hover:border-gray-400'
        }`}
      >
        <Check className="h-3 w-3" />
      </button>
      {/* Il nome va a capo invece di essere tagliato: la card e' stretta */}
      <Textarea
        rows={1}
        value={r.nome}
        onChange={(e) => onNome(e.target.value)}
        onBlur={onSalva}
        onKeyDown={invioSalva}
        placeholder="IVA a credito, acconto imposte..."
        title={r.nome}
        className={`min-h-7 flex-1 resize-none px-1.5 py-1 text-xs md:text-xs leading-snug bg-white ${barrato}`}
      />
      <Input
        value={anno}
        onChange={(e) => onAnno(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={onSalva}
        onKeyDown={invioSalva}
        placeholder="anno"
        inputMode="numeric"
        aria-label="Anno di riferimento"
        className={`h-7 w-12 shrink-0 px-1 text-xs md:text-xs text-center bg-white ${barrato}`}
      />
      <Input
        value={importo}
        onChange={(e) => onImporto(e.target.value)}
        onBlur={onSalva}
        onKeyDown={invioSalva}
        placeholder="0,00"
        inputMode="decimal"
        aria-label="Importo"
        className={`h-7 w-20 shrink-0 px-1.5 text-xs md:text-xs text-right bg-white ${barrato}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-6 shrink-0 text-red-400 hover:text-red-600"
        onClick={onElimina}
        title="Elimina"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
