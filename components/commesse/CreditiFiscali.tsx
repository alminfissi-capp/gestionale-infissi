'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Check, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addCreditoFiscale,
  updateCreditoFiscale,
  setRecuperatoCreditoFiscale,
  deleteCreditoFiscale,
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

/**
 * Card dei crediti fiscali: denaro gia' uscito che lo Stato deve restituire.
 *
 * Le ritenute d'acconto sono righe automatiche, calcolate dagli acconti: non si
 * inseriscono a mano, o finirebbero contate due volte. Tutto il resto (IVA a
 * credito, acconti d'imposta, crediti d'imposta) lo scrive l'utente.
 */
export default function CreditiFiscali({ acconti, creditiFiscali, oggi }: Props) {
  const [items, setItems] = useState<Riga[]>(() => creditiFiscali.map(toRiga))
  const [importi, setImporti] = useState<Record<string, string>>(() => initImporti(creditiFiscali))

  // Riallineamento ai dati del server dopo un refresh, senza useEffect
  const [prev, setPrev] = useState(creditiFiscali)
  if (prev !== creditiFiscali) {
    setPrev(creditiFiscali)
    setItems(creditiFiscali.map(toRiga))
    setImporti(initImporti(creditiFiscali))
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
    if (riga.nome === riga.nomeSalvato && importo === riga.importo) return

    try {
      await updateCreditoFiscale(id, { nome: riga.nome, descrizione: riga.descrizione, importo })
      setItems((cur) => cur.map((r) => (r.id === id ? { ...r, importo, nomeSalvato: r.nome } : r)))
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

      <div className="mt-2 space-y-1 text-sm">
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
          <ul className="pt-1 space-y-1 border-t border-amber-200">
            {items.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleToggle(r)}
                  title={r.recuperato ? 'Segna come ancora da recuperare' : 'Segna come recuperato'}
                  className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    r.recuperato
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-gray-300 bg-white text-transparent hover:border-gray-400'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <Input
                  value={r.nome}
                  onChange={(e) =>
                    setItems((cur) => cur.map((x) => (x.id === r.id ? { ...x, nome: e.target.value } : x)))
                  }
                  onBlur={() => handleSalva(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  placeholder="IVA a credito, acconto imposte..."
                  className={`h-8 text-sm bg-white ${r.recuperato ? 'line-through text-gray-400' : ''}`}
                />
                <Input
                  value={importi[r.id] ?? ''}
                  onChange={(e) => setImporti((cur) => ({ ...cur, [r.id]: e.target.value }))}
                  onBlur={() => handleSalva(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  placeholder="0,00"
                  inputMode="decimal"
                  className={`h-8 w-24 shrink-0 text-sm text-right bg-white ${r.recuperato ? 'line-through text-gray-400' : ''}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
                  onClick={() => handleDelete(r.id)}
                  title="Elimina"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
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
