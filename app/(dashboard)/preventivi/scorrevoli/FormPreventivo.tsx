'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Save, Printer, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { savePreventivoScorrevoli } from '@/actions/preventivi-scorrevoli'
import { calcolaTotali, getNrAntePrisma, formatEuroScorrevoli } from '@/lib/scorrevoli-pricing'
import type { ScorevoliListino } from '@/actions/scorrevoli'
import type { PreventivoScorrevoli, RigaScorrevoli, OptionalRiga, ClienteScorrevoli, StatoPreventivoScorrevoli } from '@/types/scorrevoli'

const MODELLO_LABEL: Record<string, string> = {
  alpha: 'Alpha', alpha_plus: 'Alpha Plus', maxima: 'Maxima', prisma: 'Prisma',
}

const STATI: { value: StatoPreventivoScorrevoli; label: string }[] = [
  { value: 'bozza', label: 'Bozza' },
  { value: 'inviato', label: 'Inviato' },
  { value: 'accettato', label: 'Accettato' },
  { value: 'rifiutato', label: 'Rifiutato' },
]

function newRiga(listino: ScorevoliListino): RigaScorrevoli {
  const defColore = listino.colori_struttura.find((c) => c.tipo === 'standard')
  return {
    id: crypto.randomUUID(),
    riferimento: '',
    modello: 'alpha',
    larghezza_mm: 0,
    altezza_mm: 0,
    nr_ante: 2,
    apertura: 'laterale',
    raccolta: 'destra',
    quantita: 1,
    colore_struttura_nome: defColore?.nome ?? 'Bianco Lucido',
    colore_struttura_maggiorazione: 0,
    colore_accessori: 'Bianco',
    tipo_vetro: 'standard',
    note: '',
    optional: [],
  }
}

function defaultPreventivo(listino: ScorevoliListino, numero: string): PreventivoScorrevoli {
  const p = listino.parametri_commerciali
  return {
    id: '',
    numero,
    data: new Date().toISOString().split('T')[0],
    stato: 'bozza',
    cliente: { nome: '', azienda: '', telefono: '', email: '', indirizzo: '', cantiere: '' },
    righe: [newRiga(listino)],
    sconto_vetrata_prisma: p.sconto_vetrata_prisma.valore,
    sconto_optional: p.sconto_optional.valore,
    trasporto: p.trasporto.valore,
    iva: p.iva.valore,
    margine_alm: p.margine_alm.valore,
    note_generali: '',
    created_at: '',
    updated_at: '',
  }
}

// ─── Riga singola configurazione ─────────────────────────────────────────────

function RigaForm({
  riga,
  idx,
  listino,
  onChange,
  onRemove,
  onDuplica,
  totaleRiga,
}: {
  riga: RigaScorrevoli
  idx: number
  listino: ScorevoliListino
  onChange: (r: RigaScorrevoli) => void
  onRemove: () => void
  onDuplica: () => void
  totaleRiga: { mq_fatturati: number; prezzo_mq: number; prezzo_vetrata_netto: number; maggiorazione_colore: number; totale_riga: number; totale_riga_x_qty: number; sconto_vetrata: number } | undefined
}) {
  const [open, setOpen] = useState(true)

  const set = <K extends keyof RigaScorrevoli>(k: K, v: RigaScorrevoli[K]) =>
    onChange({ ...riga, [k]: v })

  // Colori disponibili per il modello selezionato
  const coloriDisponibili = listino.colori_struttura.filter((c) =>
    c.modelli_applicabili.includes(riga.modello)
  )

  // Quando cambio modello, reset colore se non disponibile
  const handleModelloChange = (modello: string) => {
    const coloriNuovi = listino.colori_struttura.filter((c) => c.modelli_applicabili.includes(modello))
    const coloreOk = coloriNuovi.find((c) => c.nome === riga.colore_struttura_nome)
    const defColore = coloriNuovi.find((c) => c.tipo === 'standard') ?? coloriNuovi[0]
    onChange({
      ...riga,
      modello,
      colore_struttura_nome: coloreOk ? riga.colore_struttura_nome : (defColore?.nome ?? ''),
      colore_struttura_maggiorazione: coloreOk ? riga.colore_struttura_maggiorazione : (defColore?.maggiorazione ?? 0),
      nr_ante: modello === 'prisma' ? getNrAntePrisma(listino, riga.larghezza_mm || 0) : riga.nr_ante,
    })
  }

  const handleColoreChange = (nome: string) => {
    const col = coloriDisponibili.find((c) => c.nome === nome)
    onChange({ ...riga, colore_struttura_nome: nome, colore_struttura_maggiorazione: col?.maggiorazione ?? 0 })
  }

  const handleDimChange = (field: 'larghezza_mm' | 'altezza_mm', val: number) => {
    const updated = { ...riga, [field]: val }
    if (riga.modello === 'prisma') {
      updated.nr_ante = getNrAntePrisma(listino, updated.larghezza_mm || 0)
    }
    onChange(updated)
  }

  // Optional aggiuntivi per questo modello
  const optDisponibili = listino.optional.filter(
    (o) => o.modelli_applicabili.includes(riga.modello) && o.prezzo !== null &&
    o.id !== 'vetro_extrachiaro' && o.id !== 'vetro_satinato' && o.id !== 'vetro_fume'
  )

  const toggleOptional = (optId: string) => {
    const opt = listino.optional.find((o) => o.id === optId)
    if (!opt || opt.prezzo === null) return
    const exists = riga.optional.find((o) => o.optional_id === optId)
    if (exists) {
      onChange({ ...riga, optional: riga.optional.filter((o) => o.optional_id !== optId) })
    } else {
      const newOpt: OptionalRiga = {
        optional_id: optId,
        descrizione: opt.descrizione,
        prezzo: opt.prezzo,
        unita: opt.unita,
        quantita: 1,
      }
      onChange({ ...riga, optional: [...riga.optional, newOpt] })
    }
  }

  const updateOptQty = (optId: string, qty: number) => {
    onChange({
      ...riga,
      optional: riga.optional.map((o) => o.optional_id === optId ? { ...o, quantita: qty } : o),
    })
  }

  const isPrisma = riga.modello === 'prisma'

  return (
    <div className="border rounded-lg bg-white">
      {/* Header riga */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm font-medium text-gray-400 w-6">#{idx + 1}</span>
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{MODELLO_LABEL[riga.modello] ?? riga.modello}</Badge>
          {riga.riferimento && <span className="text-sm font-medium">{riga.riferimento}</span>}
          {riga.larghezza_mm > 0 && riga.altezza_mm > 0 && (
            <span className="text-xs text-gray-400">{riga.larghezza_mm}×{riga.altezza_mm}mm</span>
          )}
          {totaleRiga && totaleRiga.totale_riga_x_qty > 0 && (
            <span className="text-sm font-semibold ml-auto text-teal-700">
              € {formatEuroScorrevoli(totaleRiga.totale_riga_x_qty)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplica} title="Duplica">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={onRemove} title="Rimuovi">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t pt-4 space-y-4">
          {/* Riga 1: modello + riferimento + qty */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Modello</label>
              <select
                value={riga.modello}
                onChange={(e) => handleModelloChange(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1.5 bg-white"
              >
                {listino.modelli.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-6">
              <label className="text-xs text-gray-500 mb-1 block">Riferimento / Descrizione</label>
              <Input value={riga.riferimento} onChange={(e) => set('riferimento', e.target.value)} className="h-8 text-sm" placeholder="es. Veranda soggiorno" />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Quantità</label>
              <Input type="number" min="1" value={riga.quantita} onChange={(e) => set('quantita', parseInt(e.target.value) || 1)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Riga 2: dimensioni + nr ante + apertura */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Larghezza (mm)</label>
              <Input type="number" value={riga.larghezza_mm || ''} onChange={(e) => handleDimChange('larghezza_mm', parseFloat(e.target.value) || 0)} className="h-8 text-sm" placeholder="es. 3600" />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Altezza (mm)</label>
              <Input type="number" value={riga.altezza_mm || ''} onChange={(e) => handleDimChange('altezza_mm', parseFloat(e.target.value) || 0)} className="h-8 text-sm" placeholder="es. 2200" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nr. ante {isPrisma ? '(auto)' : ''}</label>
              <Input
                type={isPrisma ? 'text' : 'number'}
                value={riga.nr_ante}
                readOnly={isPrisma}
                onChange={(e) => !isPrisma && set('nr_ante', e.target.value)}
                className={`h-8 text-sm ${isPrisma ? 'bg-gray-50 text-gray-500' : ''}`}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Apertura</label>
              <select value={riga.apertura} onChange={(e) => set('apertura', e.target.value as RigaScorrevoli['apertura'])} className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
                <option value="laterale">Laterale</option>
                <option value="centrale">Centrale</option>
                <option value="fisso">Fisso</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Raccolta</label>
              <select value={riga.raccolta} onChange={(e) => set('raccolta', e.target.value as RigaScorrevoli['raccolta'])} className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
                <option value="">—</option>
                <option value="destra">Destra</option>
                <option value="sinistra">Sinistra</option>
              </select>
            </div>
          </div>

          {/* Riga 3: colore struttura + colore accessori + vetro */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-5">
              <label className="text-xs text-gray-500 mb-1 block">Colore struttura</label>
              <select
                value={riga.colore_struttura_nome}
                onChange={(e) => handleColoreChange(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1.5 bg-white"
              >
                <optgroup label="Standard (incluso)">
                  {coloriDisponibili.filter((c) => c.tipo === 'standard').map((c, i) => (
                    <option key={i} value={c.nome}>{c.nome}{c.ral ? ` (${c.ral})` : ''}</option>
                  ))}
                </optgroup>
                <optgroup label="Extra (maggiorazione %)">
                  {coloriDisponibili.filter((c) => c.tipo === 'extra').map((c, i) => (
                    <option key={i} value={c.nome}>{c.nome} +{Math.round(c.maggiorazione * 100)}%</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">Colore accessori</label>
              <select value={riga.colore_accessori} onChange={(e) => set('colore_accessori', e.target.value)} className="w-full text-sm border rounded px-2 py-1.5 bg-white">
                {listino.colori_accessori.map((c, i) => (
                  <option key={i} value={c.nome}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <label className="text-xs text-gray-500 mb-1 block">Tipo vetro</label>
              <select value={riga.tipo_vetro} onChange={(e) => set('tipo_vetro', e.target.value as RigaScorrevoli['tipo_vetro'])} className="w-full text-sm border rounded px-2 py-1.5 bg-white">
                <option value="standard">Standard (trasparente) — incluso</option>
                <option value="extrachiaro">Extrachiaro +70 €/mq</option>
                <option value="satinato">Satinato +70 €/mq</option>
                <option value="fume">Fumè +70 €/mq</option>
              </select>
            </div>
          </div>

          {/* Optional */}
          {optDisponibili.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Optional / Accessori</label>
              <div className="grid grid-cols-1 gap-1.5">
                {optDisponibili.map((o) => {
                  const sel = riga.optional.find((r) => r.optional_id === o.id)
                  return (
                    <div key={o.id} className={`flex items-center gap-3 p-2 rounded border text-sm cursor-pointer transition-colors ${sel ? 'border-teal-300 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}`}
                      onClick={() => toggleOptional(o.id)}>
                      <input type="checkbox" checked={!!sel} readOnly className="h-3.5 w-3.5 accent-teal-600" />
                      <span className="flex-1">{o.descrizione}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {o.prezzo !== null ? `${o.prezzo} ${o.unita}` : 'a prev.'}
                      </span>
                      {sel && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-gray-400">×</span>
                          <Input
                            type="number"
                            min="1"
                            value={sel.quantita}
                            onChange={(e) => updateOptQty(o.id, parseInt(e.target.value) || 1)}
                            className="h-6 w-14 text-xs px-1.5"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Note riga + riepilogo calcolo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Note riga</label>
              <Input value={riga.note} onChange={(e) => set('note', e.target.value)} className="h-8 text-sm" placeholder="Note specifiche..." />
            </div>
            {totaleRiga && totaleRiga.mq_fatturati > 0 && (
              <div className="text-xs text-gray-500 space-y-0.5 self-end pb-1">
                <div className="flex justify-between">
                  <span>Mq fatturati:</span>
                  <span className="font-medium text-gray-700">{totaleRiga.mq_fatturati} mq × {totaleRiga.prezzo_mq} €/mq</span>
                </div>
                <div className="flex justify-between">
                  <span>Vetrata{isPrisma ? ' netta' : ''}:</span>
                  <span className="font-medium text-gray-700">€ {formatEuroScorrevoli(totaleRiga.prezzo_vetrata_netto)}</span>
                </div>
                {totaleRiga.maggiorazione_colore > 0 && (
                  <div className="flex justify-between">
                    <span>Magg. colore:</span>
                    <span className="font-medium text-gray-700">€ {formatEuroScorrevoli(totaleRiga.maggiorazione_colore)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-0.5 text-gray-800 font-semibold">
                  <span>Totale riga × {riga.quantita}:</span>
                  <span className="text-teal-700">€ {formatEuroScorrevoli(totaleRiga.totale_riga_x_qty)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pannello totali ──────────────────────────────────────────────────────────

function PannelloTotali({
  preventivo,
  listino,
  onChange,
}: {
  preventivo: PreventivoScorrevoli
  listino: ScorevoliListino
  onChange: (p: PreventivoScorrevoli) => void
}) {
  const totali = calcolaTotali(listino, preventivo)
  const hasPrisma = preventivo.righe.some((r) => r.modello === 'prisma')

  const Riga = ({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? 'font-semibold' : ''} ${accent ? 'text-teal-700' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span>€ {value}</span>
    </div>
  )

  const PctField = ({ label, valKey }: { label: string; valKey: keyof Pick<PreventivoScorrevoli, 'sconto_vetrata_prisma' | 'sconto_optional' | 'trasporto' | 'iva'> }) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="1"
          min="0"
          max="100"
          value={Math.round((preventivo[valKey] as number) * 100)}
          onChange={(e) => onChange({ ...preventivo, [valKey]: parseFloat(e.target.value) / 100 || 0 })}
          className="h-6 w-16 text-xs px-1.5 text-right"
        />
        <span className="text-xs text-gray-400">%</span>
      </div>
    </div>
  )

  return (
    <div className="sticky top-4 border rounded-lg bg-white p-4 space-y-3">
      <h3 className="font-semibold text-sm text-gray-700 border-b pb-2">Riepilogo preventivo</h3>

      {/* Parametri editabili */}
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sconti e parametri</div>
      {hasPrisma && <PctField label="Sconto vetrata Prisma" valKey="sconto_vetrata_prisma" />}
      <PctField label="Sconto optional" valKey="sconto_optional" />
      <PctField label="Trasporto" valKey="trasporto" />
      <PctField label="IVA" valKey="iva" />

      {/* Totali calcolati */}
      <div className="border-t pt-2">
        <Riga label="Subtotale vetrate" value={formatEuroScorrevoli(totali.subtotale_vetrate)} />
        <Riga label="Subtotale optional" value={formatEuroScorrevoli(totali.subtotale_optional)} />
        <Riga label="Totale netto" value={formatEuroScorrevoli(totali.totale_netto)} bold />
        <Riga label={`Trasporto ${Math.round(preventivo.trasporto * 100)}%`} value={formatEuroScorrevoli(totali.trasporto)} />
        <Riga label="Totale imponibile" value={formatEuroScorrevoli(totali.totale_imponibile)} bold />
        <Riga label={`IVA ${Math.round(preventivo.iva * 100)}%`} value={formatEuroScorrevoli(totali.iva)} />
        <div className="border-t mt-1 pt-1">
          <Riga label="TOTALE GENERALE" value={formatEuroScorrevoli(totali.totale_generale)} bold accent />
        </div>
      </div>
    </div>
  )
}

// ─── Form principale ──────────────────────────────────────────────────────────

export default function FormPreventivo({
  listino,
  numero,
  preventivo: initialPreventivo,
}: {
  listino: ScorevoliListino
  numero?: string
  preventivo?: PreventivoScorrevoli
}) {
  const router = useRouter()
  const [preventivo, setPreventivo] = useState<PreventivoScorrevoli>(
    initialPreventivo ?? defaultPreventivo(listino, numero ?? 'SC001/2026')
  )
  const [isPending, startTransition] = useTransition()
  const isNew = !initialPreventivo

  const setCliente = (k: keyof ClienteScorrevoli, v: string) =>
    setPreventivo((p) => ({ ...p, cliente: { ...p.cliente, [k]: v } }))

  const updateRiga = useCallback((idx: number, riga: RigaScorrevoli) => {
    setPreventivo((p) => {
      const righe = [...p.righe]
      righe[idx] = riga
      return { ...p, righe }
    })
  }, [])

  const addRiga = () => setPreventivo((p) => ({ ...p, righe: [...p.righe, newRiga(listino)] }))

  const removeRiga = (idx: number) => {
    if (preventivo.righe.length === 1) return
    setPreventivo((p) => ({ ...p, righe: p.righe.filter((_, i) => i !== idx) }))
  }

  const duplicaRiga = (idx: number) => {
    const riga = { ...preventivo.righe[idx], id: crypto.randomUUID() }
    setPreventivo((p) => {
      const righe = [...p.righe]
      righe.splice(idx + 1, 0, riga)
      return { ...p, righe }
    })
  }

  const totali = calcolaTotali(listino, preventivo)

  const handleSave = () => {
    startTransition(async () => {
      try {
        const saved = await savePreventivoScorrevoli(preventivo)
        toast.success('Preventivo salvato')
        if (isNew) router.push(`/preventivi/scorrevoli/${saved.id}`)
      } catch { toast.error('Errore nel salvataggio') }
    })
  }

  const handlePrint = () => window.print()

  const inputCls = 'h-8 text-sm'
  const labelCls = 'text-xs text-gray-500 mb-1 block'

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/preventivi/scorrevoli" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'Nuovo preventivo scorrevoli' : `Preventivo ${preventivo.numero}`}
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-6">Vetrate panoramiche COPRAL</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Stampa
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            {isPending ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Colonna sinistra: form + configurazioni */}
        <div className="col-span-2 space-y-5">

          {/* Dati generali */}
          <div className="border rounded-lg bg-white p-4">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className={labelCls}>N. preventivo</label>
                <Input value={preventivo.numero} onChange={(e) => setPreventivo(p => ({ ...p, numero: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Data</label>
                <Input type="date" value={preventivo.data} onChange={(e) => setPreventivo(p => ({ ...p, data: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Stato</label>
                <select value={preventivo.stato} onChange={(e) => setPreventivo(p => ({ ...p, stato: e.target.value as StatoPreventivoScorrevoli }))}
                  className="w-full text-sm border rounded px-2 h-8 bg-white">
                  {STATI.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Cliente / Nome</label>
                <Input value={preventivo.cliente.nome} onChange={(e) => setCliente('nome', e.target.value)} className={inputCls} placeholder="Nome cognome" />
              </div>
              <div>
                <label className={labelCls}>Azienda</label>
                <Input value={preventivo.cliente.azienda} onChange={(e) => setCliente('azienda', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cantiere / Riferimento</label>
                <Input value={preventivo.cliente.cantiere} onChange={(e) => setCliente('cantiere', e.target.value)} className={inputCls} placeholder="Via, edificio..." />
              </div>
              <div>
                <label className={labelCls}>Telefono</label>
                <Input value={preventivo.cliente.telefono} onChange={(e) => setCliente('telefono', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <Input type="email" value={preventivo.cliente.email} onChange={(e) => setCliente('email', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Indirizzo</label>
                <Input value={preventivo.cliente.indirizzo} onChange={(e) => setCliente('indirizzo', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Configurazioni */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Configurazioni</h2>
              <Button variant="outline" size="sm" onClick={addRiga}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Aggiungi riga
              </Button>
            </div>

            {preventivo.righe.map((riga, idx) => (
              <RigaForm
                key={riga.id}
                riga={riga}
                idx={idx}
                listino={listino}
                onChange={(r) => updateRiga(idx, r)}
                onRemove={() => removeRiga(idx)}
                onDuplica={() => duplicaRiga(idx)}
                totaleRiga={totali.righe.find((r) => r.id === riga.id)}
              />
            ))}

            <Button variant="outline" className="w-full" onClick={addRiga}>
              <Plus className="h-4 w-4 mr-1.5" />
              Aggiungi configurazione
            </Button>
          </div>

          {/* Note generali */}
          <div className="border rounded-lg bg-white p-4">
            <label className={labelCls}>Note generali</label>
            <textarea
              value={preventivo.note_generali}
              onChange={(e) => setPreventivo(p => ({ ...p, note_generali: e.target.value }))}
              rows={3}
              className="w-full text-sm border rounded px-2 py-1.5 resize-none"
              placeholder="Note, condizioni, tempistiche..."
            />
          </div>
        </div>

        {/* Colonna destra: totali */}
        <div>
          <PannelloTotali preventivo={preventivo} listino={listino} onChange={setPreventivo} />
        </div>
      </div>

      {/* Print area */}
      <div className="hidden print:block mt-8 text-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">Preventivo Vetrate Scorrevoli Panoramiche</h1>
          <p className="text-gray-500">N. {preventivo.numero} del {new Date(preventivo.data).toLocaleDateString('it-IT')}</p>
        </div>
        <div className="mb-4">
          <p><strong>Cliente:</strong> {preventivo.cliente.nome} {preventivo.cliente.azienda}</p>
          {preventivo.cliente.cantiere && <p><strong>Cantiere:</strong> {preventivo.cliente.cantiere}</p>}
        </div>
        <table className="w-full border-collapse text-xs mb-6">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-1">Rif.</th>
              <th className="text-left py-1">Modello</th>
              <th className="text-right py-1">Dim. (L×H mm)</th>
              <th className="text-right py-1">Mq</th>
              <th className="text-center py-1">Ap.</th>
              <th className="text-left py-1">Colore</th>
              <th className="text-right py-1">Qt.</th>
              <th className="text-right py-1">Totale</th>
            </tr>
          </thead>
          <tbody>
            {preventivo.righe.map((r, i) => {
              const t = totali.righe.find((x) => x.id === r.id)
              return (
                <tr key={i} className="border-b">
                  <td className="py-1">{r.riferimento || `—`}</td>
                  <td className="py-1">{MODELLO_LABEL[r.modello]}</td>
                  <td className="text-right py-1">{r.larghezza_mm}×{r.altezza_mm}</td>
                  <td className="text-right py-1">{t?.mq_fatturati}</td>
                  <td className="text-center py-1 capitalize">{r.apertura}</td>
                  <td className="py-1">{r.colore_struttura_nome}</td>
                  <td className="text-right py-1">{r.quantita}</td>
                  <td className="text-right py-1 font-semibold">€ {formatEuroScorrevoli(t?.totale_riga_x_qty ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between"><span>Totale netto</span><span>€ {formatEuroScorrevoli(totali.totale_netto)}</span></div>
            <div className="flex justify-between"><span>Trasporto {Math.round(preventivo.trasporto * 100)}%</span><span>€ {formatEuroScorrevoli(totali.trasporto)}</span></div>
            <div className="flex justify-between"><span>Totale imponibile</span><span className="font-semibold">€ {formatEuroScorrevoli(totali.totale_imponibile)}</span></div>
            <div className="flex justify-between"><span>IVA {Math.round(preventivo.iva * 100)}%</span><span>€ {formatEuroScorrevoli(totali.iva)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold text-base"><span>TOTALE</span><span>€ {formatEuroScorrevoli(totali.totale_generale)}</span></div>
          </div>
        </div>
        {preventivo.note_generali && (
          <div className="mt-6 text-xs text-gray-500">
            <p className="font-semibold mb-1">Note:</p>
            <p>{preventivo.note_generali}</p>
          </div>
        )}
      </div>
    </div>
  )
}
