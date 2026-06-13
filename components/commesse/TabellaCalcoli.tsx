'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Star, FolderOpen, Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  toggleCalcoli,
  setIncassoPrevisto,
  addRigaCalcolo,
  updateRigaCalcolo,
  deleteRigaCalcolo,
} from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, GruppoCommesse, RigaCalcolo } from '@/types/commessa'

interface Props {
  commesse: CommessaCompleta[]
  gruppi: GruppoCommesse[]
  righe: RigaCalcolo[]
}

// Riga con snapshot dell'ultima descrizione salvata (per evitare salvataggi inutili al blur)
type RigaCalcoloRow = RigaCalcolo & { descrizioneSalvata: string }

const toRow = (r: RigaCalcolo): RigaCalcoloRow => ({ ...r, descrizioneSalvata: r.descrizione })

const parseImporto = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

export default function TabellaCalcoli({ commesse, gruppi, righe }: Props) {
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

  // ── Righe giacenze / liquidità ──────────────────────────────
  const [righeItems, setRigheItems] = useState<RigaCalcoloRow[]>(() => righe.map(toRow))
  const [importiStr, setImportiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(righe.map((r) => [r.id, r.importo ? String(r.importo) : '']))
  )
  const [prevRighe, setPrevRighe] = useState(righe)
  if (prevRighe !== righe) {
    setPrevRighe(righe)
    setRigheItems(righe.map(toRow))
    setImportiStr(Object.fromEntries(righe.map((r) => [r.id, r.importo ? String(r.importo) : ''])))
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

  // ── Handler righe giacenze ──────────────────────────────────
  const handleAddRiga = async () => {
    try {
      const nuova = await addRigaCalcolo()
      setRigheItems((cur) => [...cur, toRow(nuova)])
      setImportiStr((cur) => ({ ...cur, [nuova.id]: '' }))
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDescrizioneChange = (id: string, descrizione: string) =>
    setRigheItems((cur) => cur.map((r) => (r.id === id ? { ...r, descrizione } : r)))

  const handleSalvaRiga = async (id: string) => {
    const riga = righeItems.find((r) => r.id === id)
    if (!riga) return
    const importo = parseImporto(importiStr[id] ?? '')
    if (riga.descrizione === riga.descrizioneSalvata && importo === riga.importo) return
    try {
      await updateRigaCalcolo(id, riga.descrizione, importo)
      setRigheItems((cur) =>
        cur.map((r) => (r.id === id ? { ...r, importo, descrizioneSalvata: r.descrizione } : r))
      )
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDeleteRiga = async (id: string) => {
    const prev = righeItems
    setRigheItems((cur) => cur.filter((r) => r.id !== id))
    try {
      await deleteRigaCalcolo(id)
    } catch {
      setRigheItems(prev)
      toast.error('Errore nel salvataggio')
    }
  }

  const totali = useMemo(() => ({
    totale:  items.reduce((s, c) => s + c.totale, 0),
    acconti: items.reduce((s, c) => s + c.totale_acconti, 0),
    saldo:   items.reduce((s, c) => s + c.saldo, 0),
    previsto: items.reduce((s, c) => s + parseImporto(previsti[c.id] ?? ''), 0),
  }), [items, previsti])

  const liquidita = useMemo(
    () => righeItems.reduce((s, r) => s + parseImporto(importiStr[r.id] ?? ''), 0),
    [righeItems, importiStr]
  )

  return (
    <div className="space-y-6">
      {/* ── Tabella commesse ── */}
      {items.length === 0 ? (
        <div className="rounded-md border bg-white p-12 text-center text-sm text-gray-400">
          Nessuna commessa selezionata.
          <br />
          Apri un blocco e clicca la stellina su una commessa per aggiungerla ai Calcoli.
        </div>
      ) : (
        <div className="space-y-2">
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
              <TableFooter className="bg-amber-50/60 border-t-2 border-amber-200">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-sm text-gray-500 font-medium">
                    {items.length} {items.length === 1 ? 'commessa' : 'commesse'}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-sm font-bold text-gray-900">
                    {formatEuro(totali.totale)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-gray-700">
                    {formatEuro(totali.acconti)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold text-amber-800">
                    {formatEuro(totali.saldo)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold text-emerald-800">
                    {formatEuro(totali.previsto)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Legenda totali commesse */}
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 px-1 text-xs text-gray-500">
            <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-400 mr-1.5 align-middle" />Saldo da incassare = incasso possibile</span>
            <span><span className="inline-block h-2 w-2 rounded-sm bg-emerald-400 mr-1.5 align-middle" />Incasso previsto (inserito a mano)</span>
          </div>
        </div>
      )}

      {/* ── Giacenze / Liquidità corrente ── */}
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/60">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Giacenze e liquidità
          </h3>
          <Button variant="outline" size="sm" onClick={handleAddRiga}>
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi riga
          </Button>
        </div>

        {righeItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Nessuna voce. Usa &quot;Aggiungi riga&quot; per inserire le giacenze in banca, contanti, ecc.
          </p>
        ) : (
          <div className="divide-y">
            {righeItems.map((r) => (
              <div key={r.id} className="flex items-center gap-2 sm:gap-3 px-4 py-2">
                <Input
                  value={r.descrizione}
                  placeholder="Es. Banca Intesa c/c, Contanti cassa…"
                  onChange={(e) => handleDescrizioneChange(r.id, e.target.value)}
                  onBlur={() => handleSalvaRiga(r.id)}
                  className="h-9 flex-1 text-sm"
                />
                <div className="relative w-[140px] shrink-0">
                  <Input
                    type="number"
                    step={0.01}
                    value={importiStr[r.id] ?? ''}
                    placeholder="0,00"
                    onChange={(e) => setImportiStr((cur) => ({ ...cur, [r.id]: e.target.value }))}
                    onBlur={() => handleSalvaRiga(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="h-9 text-right text-sm pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-gray-300 hover:text-red-500 shrink-0"
                  title="Elimina riga"
                  onClick={() => handleDeleteRiga(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Footer liquidità corrente */}
        <div className="flex items-center justify-between px-4 py-3 border-t-2 border-emerald-200 bg-emerald-50/60">
          <span className="text-sm font-semibold text-emerald-900">Liquidità corrente</span>
          <span className="text-lg font-bold text-emerald-800 pr-12">{formatEuro(liquidita)}</span>
        </div>
      </div>
    </div>
  )
}
