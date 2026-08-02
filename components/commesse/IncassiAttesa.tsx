'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { HandCoins, Plus, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addIncassoAttesa,
  updateIncassoAttesa,
  setIncassatoAttesa,
  deleteIncassoAttesa,
} from '@/actions/commesse'
import { formatEuro, parseImporto, formatImporto } from '@/lib/pricing'
import type { IncassoAttesa } from '@/types/commessa'

interface Props {
  incassi: IncassoAttesa[]
}

// Snapshot dei testi salvati, per non riscrivere sul server quando nulla è cambiato
type Riga = IncassoAttesa & { nomeSalvato: string; descrizioneSalvata: string }

const toRiga = (i: IncassoAttesa): Riga => ({
  ...i,
  nomeSalvato: i.nome,
  descrizioneSalvata: i.descrizione,
})

const initImporti = (list: IncassoAttesa[]) =>
  Object.fromEntries(list.map((i) => [i.id, i.importo ? formatImporto(i.importo) : '']))

const initConcordati = (list: IncassoAttesa[]) =>
  Object.fromEntries(
    list.map((i) => [i.id, i.incasso_concordato != null ? formatImporto(i.incasso_concordato) : ''])
  )

export default function IncassiAttesa({ incassi }: Props) {
  const [items, setItems] = useState<Riga[]>(() => incassi.map(toRiga))
  const [importi, setImporti] = useState<Record<string, string>>(() => initImporti(incassi))
  const [concordati, setConcordati] = useState<Record<string, string>>(() => initConcordati(incassi))

  // Sincronizza con i dati server dopo un refresh (adjust-state-during-render)
  const [prevIncassi, setPrevIncassi] = useState(incassi)
  if (prevIncassi !== incassi) {
    setPrevIncassi(incassi)
    setItems(incassi.map(toRiga))
    setImporti(initImporti(incassi))
    setConcordati(initConcordati(incassi))
  }

  const handleAdd = async () => {
    try {
      const nuovo = await addIncassoAttesa()
      setItems((cur) => [...cur, toRiga(nuovo)])
      setImporti((cur) => ({ ...cur, [nuovo.id]: '' }))
      setConcordati((cur) => ({ ...cur, [nuovo.id]: '' }))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleTestoChange = (id: string, campo: 'nome' | 'descrizione', valore: string) =>
    setItems((cur) => cur.map((r) => (r.id === id ? { ...r, [campo]: valore } : r)))

  const handleSalva = async (id: string) => {
    const riga = items.find((r) => r.id === id)
    if (!riga) return

    const rawImporto = (importi[id] ?? '').trim()
    const importo = parseImporto(rawImporto)
    if (rawImporto !== '') setImporti((cur) => ({ ...cur, [id]: formatImporto(importo) }))

    const rawConcordato = (concordati[id] ?? '').trim()
    const incasso_concordato = rawConcordato === '' ? null : parseImporto(rawConcordato)
    if (incasso_concordato !== null) {
      setConcordati((cur) => ({ ...cur, [id]: formatImporto(incasso_concordato) }))
    }

    const invariato =
      riga.nome === riga.nomeSalvato &&
      riga.descrizione === riga.descrizioneSalvata &&
      importo === riga.importo &&
      incasso_concordato === riga.incasso_concordato
    if (invariato) return

    try {
      await updateIncassoAttesa(id, {
        nome: riga.nome,
        descrizione: riga.descrizione,
        importo,
        incasso_concordato,
      })
      setItems((cur) =>
        cur.map((r) =>
          r.id === id
            ? {
                ...r,
                importo,
                incasso_concordato,
                nomeSalvato: r.nome,
                descrizioneSalvata: r.descrizione,
              }
            : r
        )
      )
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleToggleIncassato = async (riga: Riga) => {
    const nuovo = !riga.incassato
    setItems((cur) => cur.map((r) => (r.id === riga.id ? { ...r, incassato: nuovo } : r)))
    try {
      await setIncassatoAttesa(riga.id, nuovo)
    } catch {
      setItems((cur) => cur.map((r) => (r.id === riga.id ? { ...r, incassato: !nuovo } : r)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDelete = async (id: string) => {
    const prev = items
    setItems((cur) => cur.filter((r) => r.id !== id))
    try {
      await deleteIncassoAttesa(id)
    } catch {
      setItems(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  // Solo le righe non ancora incassate entrano nei totali
  const totali = useMemo(() => {
    const attesa = items.filter((r) => !r.incassato)
    return {
      ammontare: attesa.reduce((s, r) => s + parseImporto(importi[r.id] ?? ''), 0),
      concordato: attesa.reduce((s, r) => s + parseImporto(concordati[r.id] ?? ''), 0),
      quante: attesa.length,
    }
  }, [items, importi, concordati])

  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50/50">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-amber-600" />
          Incassi in attesa
          <span className="text-xs font-normal text-gray-400">(entrate che non sono commesse)</span>
        </h3>
        <Button variant="outline" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi riga
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          Nessun incasso in attesa. Usa &quot;Aggiungi riga&quot; per annotare rimborsi, note di
          credito o prestiti da farsi restituire.
        </p>
      ) : (
        <div className="divide-y">
          {items.map((r) => (
            <div
              key={r.id}
              className={`px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 ${
                r.incassato ? 'bg-emerald-50/60' : ''
              }`}
            >
              {/* Nome + descrizione */}
              <div className="flex-1 min-w-0 flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Input
                  value={r.nome}
                  placeholder="Chi deve i soldi"
                  onChange={(e) => handleTestoChange(r.id, 'nome', e.target.value)}
                  onBlur={() => handleSalva(r.id)}
                  className={`h-9 text-sm sm:w-[38%] ${r.incassato ? 'line-through text-gray-400' : ''}`}
                />
                <Input
                  value={r.descrizione}
                  placeholder="Es. rimborso INPS, nota di credito…"
                  onChange={(e) => handleTestoChange(r.id, 'descrizione', e.target.value)}
                  onBlur={() => handleSalva(r.id)}
                  className={`h-9 flex-1 text-sm ${r.incassato ? 'line-through text-gray-400' : ''}`}
                />
              </div>

              {/* Importi + azioni */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="relative flex-1 sm:flex-none sm:w-[130px]">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={importi[r.id] ?? ''}
                    placeholder="0,00"
                    title="Ammontare dovuto"
                    onChange={(e) => setImporti((cur) => ({ ...cur, [r.id]: e.target.value }))}
                    onBlur={() => handleSalva(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="h-9 text-right text-sm pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
                </div>
                <div className="relative flex-1 sm:flex-none sm:w-[130px]">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={concordati[r.id] ?? ''}
                    placeholder="concordato"
                    title="Incasso concordato"
                    onChange={(e) => setConcordati((cur) => ({ ...cur, [r.id]: e.target.value }))}
                    onBlur={() => handleSalva(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="h-9 text-right text-sm pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleIncassato(r)}
                  title={r.incassato ? 'Segna come da incassare' : 'Segna come incassato'}
                  className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                    r.incassato
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 text-transparent hover:border-emerald-400'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-gray-300 hover:text-red-500 shrink-0"
                  title="Elimina riga"
                  onClick={() => handleDelete(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer: stessi colori della tabella commesse (ambra = dovuto, verde = concordato) */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t-2 border-amber-200 bg-amber-50/60">
        <span className="text-sm font-semibold text-amber-900">
          Totale in attesa
          {items.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-500">
              ({totali.quante} {totali.quante === 1 ? 'riga' : 'righe'})
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-4 sm:gap-6">
          <span className="text-lg font-bold text-amber-800">{formatEuro(totali.ammontare)}</span>
          <span className="w-[130px] text-right text-lg font-bold text-emerald-800 sm:pr-[52px]">
            {formatEuro(totali.concordato)}
          </span>
        </span>
      </div>
    </div>
  )
}
