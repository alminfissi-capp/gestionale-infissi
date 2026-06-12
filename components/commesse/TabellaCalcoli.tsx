'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Star, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toggleCalcoli, setIncassoPrevisto } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, GruppoCommesse } from '@/types/commessa'

interface Props {
  commesse: CommessaCompleta[]
  gruppi: GruppoCommesse[]
}

export default function TabellaCalcoli({ commesse, gruppi }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<CommessaCompleta[]>(commesse)

  // Incasso previsto editabile per riga (stringa per l'input, somma immediata)
  const initPrevisti = (list: CommessaCompleta[]) =>
    Object.fromEntries(list.map((c) => [c.id, c.incasso_previsto != null ? String(c.incasso_previsto) : '']))
  const [previsti, setPrevisti] = useState<Record<string, string>>(() => initPrevisti(commesse))

  // Sincronizza con i dati server dopo router.refresh() (adjust-state-during-render)
  const [prevCommesse, setPrevCommesse] = useState(commesse)
  if (prevCommesse !== commesse) {
    setPrevCommesse(commesse)
    setItems(commesse)
    setPrevisti(initPrevisti(commesse))
  }

  // Salva al blur (solo se cambiato rispetto al valore già memorizzato)
  const handleSalvaPrevisto = async (c: CommessaCompleta) => {
    const raw = (previsti[c.id] ?? '').trim()
    const value = raw === '' ? null : parseFloat(raw.replace(',', '.'))
    if (value !== null && isNaN(value)) return
    if (value === c.incasso_previsto) return
    try {
      await setIncassoPrevisto(c.id, value)
      setItems((cur) => cur.map((x) => x.id === c.id ? { ...x, incasso_previsto: value } : x))
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const nomeGruppo = (gruppoId: string | null) =>
    gruppi.find((g) => g.id === gruppoId)?.nome ?? '—'

  const handleRimuovi = async (id: string) => {
    const prev = items
    setItems((cur) => cur.filter((c) => c.id !== id))
    try {
      await toggleCalcoli(id, false)
      router.refresh()
    } catch {
      setItems(prev)
      toast.error('Errore nel salvataggio')
    }
  }

  const totali = useMemo(() => ({
    totale:  items.reduce((s, c) => s + c.totale, 0),
    acconti: items.reduce((s, c) => s + c.totale_acconti, 0),
    saldo:   items.reduce((s, c) => s + c.saldo, 0),
    previsto: items.reduce((s, c) => {
      const v = parseFloat((previsti[c.id] ?? '').replace(',', '.'))
      return s + (isNaN(v) ? 0 : v)
    }, 0),
  }), [items, previsti])

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-white p-12 text-center text-sm text-gray-400">
        Nessuna commessa selezionata.
        <br />
        Apri un blocco e clicca la stellina su una commessa per aggiungerla ai Calcoli.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>N. Comm.</TableHead>
              <TableHead>Blocco</TableHead>
              <TableHead className="text-right">Totale</TableHead>
              <TableHead className="text-right">Acconti</TableHead>
              <TableHead className="text-right">Saldo da incassare</TableHead>
              <TableHead className="text-right w-[140px]">Incasso previsto</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium text-sm">{c.cliente_nome}</p>
                  {c.note && <p className="text-xs text-gray-400 truncate max-w-[260px]">{c.note}</p>}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.numero_commessa || <span className="text-gray-300">—</span>}
                </TableCell>
                <TableCell>
                  {c.gruppo_id ? (
                    <Link
                      href={`/commesse/${c.gruppo_id}?highlight=${c.id}`}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5"
                      title="Apri nel blocco"
                    >
                      <FolderOpen className="h-3 w-3" />
                      {nomeGruppo(c.gruppo_id)}
                    </Link>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  {formatEuro(c.totale)}
                </TableCell>
                <TableCell className="text-right text-sm text-gray-500">
                  {c.totale_acconti > 0 ? formatEuro(c.totale_acconti) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    className={
                      c.saldo > 0.005
                        ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100'
                        : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
                    }
                  >
                    {formatEuro(c.saldo)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={previsti[c.id] ?? ''}
                    placeholder="0,00"
                    onChange={(e) => setPrevisti((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    onBlur={() => handleSalvaPrevisto(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="h-8 w-[120px] ml-auto text-right text-sm"
                  />
                </TableCell>
                <TableCell className="text-right pr-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Rimuovi dai Calcoli"
                    onClick={() => handleRimuovi(c.id)}
                  >
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Riepilogo incassi */}
      <div className="rounded-md border bg-amber-50/50 border-amber-200 p-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-2">
        <div className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? 'commessa' : 'commesse'}
        </div>
        <div className="text-sm text-gray-600">
          Totale: <span className="font-semibold text-gray-900">{formatEuro(totali.totale)}</span>
        </div>
        <div className="text-sm text-gray-600">
          Acconti: <span className="font-semibold text-gray-900">{formatEuro(totali.acconti)}</span>
        </div>
        <div className="text-base text-amber-800">
          Incasso possibile: <span className="font-bold">{formatEuro(totali.saldo)}</span>
        </div>
        <div className="text-base text-emerald-800">
          Incasso previsto: <span className="font-bold">{formatEuro(totali.previsto)}</span>
        </div>
      </div>
    </div>
  )
}
