'use client'

import { useMemo, useState } from 'react'
import { Search, Landmark, Check, Ban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/pricing'
import type { Scadenza, CategoriaScadenza } from '@/types/commessa'

// Etichette estese: servono anche alla ricerca, così "finanziamento" o
// "bonifico" trovano le righe anche quando il fornitore non li nomina
const CAT_LABEL: Record<CategoriaScadenza, string> = {
  finanziamento: 'Finanziamento',
  assegno: 'Assegno / Bonifico',
  utenza: 'Utenza',
  tassa: 'Tassa',
  altro: 'Altro',
}

const CAT_CLS: Record<CategoriaScadenza, string> = {
  finanziamento: 'bg-purple-100 text-purple-700 border-purple-200',
  assegno: 'bg-blue-100 text-blue-700 border-blue-200',
  utenza: 'bg-amber-100 text-amber-700 border-amber-200',
  tassa: 'bg-rose-100 text-rose-700 border-rose-200',
  altro: 'bg-gray-100 text-gray-600 border-gray-200',
}

const MESI_BREVI = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
]

/** Minuscolo e senza accenti: "Città" trova "citta" e viceversa */
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

const formatGiorno = (data: string) => {
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  anno: number
  scadenze: Scadenza[]
  contoNome: Record<string, string>
  /** Porta alla riga nell'elenco: apre il mese, chiude la finestra ed evidenzia */
  onVaiA: (s: Scadenza) => void
}

/**
 * Ricerca a testo libero dentro un blocco anno. Si scrive anche solo un pezzo
 * del nome (fornitore, descrizione, banca, categoria) e l'elenco si aggiorna
 * mentre si digita, con la data di ogni scadenza e il totale dei risultati.
 */
export default function DialogRicercaScadenze({
  open, onOpenChange, anno, scadenze, contoNome, onVaiA,
}: Props) {
  const [q, setQ] = useState('')

  // Testo cercabile precalcolato una volta per riga
  const indice = useMemo(
    () => scadenze.map((s) => ({
      s,
      testo: norm([
        s.fornitore,
        s.descrizione,
        CAT_LABEL[s.categoria],
        s.conto_id ? contoNome[s.conto_id] ?? '' : '',
        s.numero_rata != null ? `rata ${s.numero_rata}` : '',
        s.data_scadenza ? MESI_BREVI[Number(s.data_scadenza.slice(5, 7)) - 1] : '',
        s.annullata ? 'annullata' : s.pagato ? 'pagata' : 'da pagare',
      ].join(' ')),
    })),
    [scadenze, contoNome]
  )

  // Tutte le parole digitate devono comparire: "enel gen" trova la bolletta di gennaio
  const risultati = useMemo(() => {
    const parole = norm(q).split(/\s+/).filter(Boolean)
    if (parole.length === 0) return []
    return indice
      .filter(({ testo }) => parole.every((p) => testo.includes(p)))
      .map(({ s }) => s)
      .sort((a, b) => (a.data_scadenza ?? '').localeCompare(b.data_scadenza ?? ''))
  }, [indice, q])

  const totali = useMemo(() => {
    const attive = risultati.filter((s) => !s.annullata)
    return {
      totale: attive.reduce((acc, s) => acc + s.importo, 0),
      daPagare: attive.reduce((acc, s) => acc + (s.pagato ? 0 : s.importo), 0),
    }
  }, [risultati])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[85vh] gap-3">
        <DialogHeader>
          <DialogTitle>Cerca nelle scadenze {anno}</DialogTitle>
          <DialogDescription>
            Scrivi anche solo una parte del nome: fornitore, finanziamento, banca o descrizione.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="es. Enel, Findomestic, F24…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {q.trim() === '' ? (
            <p className="py-10 text-center text-sm text-gray-400">
              Inizia a scrivere per vedere le scadenze corrispondenti.
            </p>
          ) : risultati.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">
              Nessuna scadenza trovata nel {anno} per &ldquo;{q}&rdquo;.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {risultati.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onVaiA(s)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-rose-50 transition-colors ${
                    s.annullata ? 'opacity-60' : ''
                  }`}
                >
                  {/* Data: è il dato che si sta cercando, quindi sta per primo */}
                  <div className="w-20 shrink-0">
                    <span className="text-sm font-semibold text-gray-700">
                      {s.data_scadenza ? formatGiorno(s.data_scadenza) : '—'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm font-medium truncate ${
                        s.annullata ? 'text-gray-500 line-through' : 'text-gray-800'
                      }`}>
                        {s.fornitore || <span className="text-gray-400">—</span>}
                      </span>
                      <span className={`text-[10px] rounded border px-1 py-0 font-medium ${CAT_CLS[s.categoria]}`}>
                        {CAT_LABEL[s.categoria]}
                      </span>
                      {s.numero_rata != null && (
                        <span className="text-[10px] rounded border border-gray-200 bg-gray-50 text-gray-500 px-1 py-0">
                          Rata {s.numero_rata}{s.totale_rate ? `/${s.totale_rate}` : ''}
                        </span>
                      )}
                      {s.conto_id && contoNome[s.conto_id] && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] rounded border border-slate-200 bg-slate-50 text-slate-600 px-1 py-0">
                          <Landmark className="h-2.5 w-2.5" />
                          {contoNome[s.conto_id]}
                        </span>
                      )}
                    </div>
                    {s.descrizione && (
                      <p className="text-xs text-gray-500 truncate">{s.descrizione}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className={`text-sm font-semibold ${
                      s.annullata
                        ? 'text-gray-400 line-through'
                        : s.pagato ? 'text-emerald-700 line-through' : 'text-gray-900'
                    }`}>
                      {formatEuro(s.importo)}
                    </span>
                  </div>

                  <div className="w-5 shrink-0 flex justify-center">
                    {s.annullata ? (
                      <Ban className="h-4 w-4 text-gray-400" />
                    ) : s.pagato ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Totale dei risultati: cercando un fornitore si legge subito quanto pesa nell'anno */}
        {risultati.length > 0 && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t pt-3 text-sm">
            <span className="text-gray-500">
              {risultati.length} {risultati.length === 1 ? 'scadenza trovata' : 'scadenze trovate'}
            </span>
            <span>
              <span className="text-gray-700 font-semibold">Totale: {formatEuro(totali.totale)}</span>
              {totali.daPagare > 0 ? (
                <span className="text-rose-700 font-bold"> · {formatEuro(totali.daPagare)} da pagare</span>
              ) : (
                <span className="text-emerald-600 font-semibold"> · saldato</span>
              )}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
