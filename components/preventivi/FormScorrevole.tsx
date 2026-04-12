'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { calcolaRiga, getNrAntePrisma, formatEuroScorrevoli } from '@/lib/scorrevoli-pricing'
import { formatEuro } from '@/lib/pricing'
import type { ScorevoliListino } from '@/actions/scorrevoli'
import type { RigaScorrevoli, OptionalRiga, ConfigScorrevoleArticolo } from '@/types/scorrevoli'
import type { ArticoloWizard } from '@/types/preventivo'

const MODELLO_LABEL: Record<string, string> = {
  alpha: 'Alpha', alpha_plus: 'Alpha Plus', maxima: 'Maxima', prisma: 'Prisma',
}

function buildTipologia(riga: RigaScorrevoli): string {
  const mod = MODELLO_LABEL[riga.modello] ?? riga.modello
  const dim = riga.larghezza_mm && riga.altezza_mm
    ? ` ${(riga.larghezza_mm / 1000).toFixed(2).replace('.', ',')}×${(riga.altezza_mm / 1000).toFixed(2).replace('.', ',')}m`
    : ''
  const ap = riga.apertura !== 'fisso' ? ` - ${riga.nr_ante} ante ${riga.apertura}` : ' - fisso'
  const col = riga.colore_struttura_nome ? ` - ${riga.colore_struttura_nome}` : ''
  const rif = riga.riferimento ? ` [${riga.riferimento}]` : ''
  return `Scorrevole ${mod}${dim}${ap}${col}${rif}`
}

function buildNote(cfg: ConfigScorrevoleArticolo): string {
  const d = cfg.dettaglio
  const parts: string[] = [
    `Mq fatturati: ${d.mq_fatturati} mq @ ${d.prezzo_mq} €/mq`,
  ]
  if (d.sconto_vetrata > 0) parts.push(`Sconto vetrata: −€${formatEuroScorrevoli(d.sconto_vetrata)}`)
  if (d.maggiorazione_colore > 0) parts.push(`Magg. colore: +€${formatEuroScorrevoli(d.maggiorazione_colore)}`)
  if (d.prezzo_vetro_extra > 0) parts.push(`Vetro speciale: +€${formatEuroScorrevoli(d.prezzo_vetro_extra)}`)
  if (d.totale_optional > 0) parts.push(`Optional (netto): €${formatEuroScorrevoli(d.totale_optional_netto)}`)
  if (cfg.posa > 0) parts.push(`Posa: ${formatEuro(cfg.posa)} €`)
  if (cfg.ricarico_percentuale != null && cfg.ricarico_percentuale > 0)
    parts.push(`Ricarico: ${cfg.ricarico_percentuale}%`)
  else if (cfg.ricarico_fisso != null && cfg.ricarico_fisso > 0)
    parts.push(`Ricarico: ${formatEuro(cfg.ricarico_fisso)} €`)
  if (cfg.riga.note) parts.push(cfg.riga.note)
  return parts.join(' | ')
}

function emptyRiga(listino: ScorevoliListino): RigaScorrevoli {
  const defColore = listino.colori_struttura.find((c) => c.tipo === 'standard')
  return {
    id: crypto.randomUUID(),
    riferimento: '',
    modello: listino.modelli[0]?.id ?? 'alpha',
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

interface Props {
  listino: ScorevoliListino
  aliquote: number[]
  initialValues?: ArticoloWizard
  isEditing?: boolean
  onAdd: (a: ArticoloWizard) => void
}

export default function FormScorrevole({ listino, aliquote, initialValues, isEditing, onAdd }: Props) {
  const p = listino.parametri_commerciali
  const [riga, setRiga] = useState<RigaScorrevoli>(() => {
    if (initialValues?.config_scorrevole) return initialValues.config_scorrevole.riga
    return emptyRiga(listino)
  })
  const [scontoVetrata, setScontoVetrata] = useState(() =>
    initialValues?.config_scorrevole?.sconto_vetrata_prisma ?? p.sconto_vetrata_prisma.valore
  )
  const [scontoOptional, setScontoOptional] = useState(() =>
    initialValues?.config_scorrevole?.sconto_optional ?? p.sconto_optional.valore
  )
  const [posa, setPosa] = useState<string>(
    initialValues?.config_scorrevole?.posa ? String(initialValues.config_scorrevole.posa) : ''
  )
  type ModoRicarico = 'percentuale' | 'fisso'
  const [modoRicarico, setModoRicarico] = useState<ModoRicarico>(
    initialValues?.config_scorrevole?.ricarico_percentuale != null ? 'percentuale' : 'fisso'
  )
  const [ricaricoval, setRicaricoVal] = useState<string>(
    initialValues?.config_scorrevole
      ? String(initialValues.config_scorrevole.ricarico_percentuale ?? initialValues.config_scorrevole.ricarico_fisso ?? '')
      : ''
  )

  // Reset quando si cambia modello
  const handleModelloChange = (modello: string) => {
    const coloriNuovi = listino.colori_struttura.filter((c) => c.modelli_applicabili.includes(modello))
    const defColore = coloriNuovi.find((c) => c.tipo === 'standard') ?? coloriNuovi[0]
    setRiga((r) => ({
      ...r,
      modello,
      colore_struttura_nome: defColore?.nome ?? '',
      colore_struttura_maggiorazione: defColore?.maggiorazione ?? 0,
      nr_ante: modello === 'prisma' ? getNrAntePrisma(listino, r.larghezza_mm || 0) : r.nr_ante,
      optional: [],
    }))
  }

  const handleColoreChange = (nome: string) => {
    const col = listino.colori_struttura.find(
      (c) => c.nome === nome && c.modelli_applicabili.includes(riga.modello)
    )
    setRiga((r) => ({ ...r, colore_struttura_nome: nome, colore_struttura_maggiorazione: col?.maggiorazione ?? 0 }))
  }

  const handleDimChange = (field: 'larghezza_mm' | 'altezza_mm', val: number) => {
    setRiga((r) => {
      const updated = { ...r, [field]: val }
      if (r.modello === 'prisma') {
        updated.nr_ante = getNrAntePrisma(listino, updated.larghezza_mm || 0)
      }
      return updated
    })
  }

  const toggleOptional = (optId: string) => {
    const opt = listino.optional.find((o) => o.id === optId)
    if (!opt || opt.prezzo === null) return
    setRiga((r) => {
      const exists = r.optional.find((o) => o.optional_id === optId)
      if (exists) return { ...r, optional: r.optional.filter((o) => o.optional_id !== optId) }
      const newOpt: OptionalRiga = { optional_id: optId, descrizione: opt.descrizione, prezzo: opt.prezzo!, unita: opt.unita, quantita: 1 }
      return { ...r, optional: [...r.optional, newOpt] }
    })
  }

  const updateOptQty = (optId: string, qty: number) => {
    setRiga((r) => ({ ...r, optional: r.optional.map((o) => o.optional_id === optId ? { ...o, quantita: qty } : o) }))
  }

  const isPrisma = riga.modello === 'prisma'
  const coloriDisponibili = listino.colori_struttura.filter((c) => c.modelli_applicabili.includes(riga.modello))
  const optDisponibili = listino.optional.filter(
    (o) => o.modelli_applicabili.includes(riga.modello) && o.prezzo !== null &&
    !['vetro_extrachiaro', 'vetro_satinato', 'vetro_fume'].includes(o.id)
  )

  // Calcolo live
  const dettaglio = calcolaRiga(listino, riga, scontoVetrata, scontoOptional)
  const posaN = parseFloat(posa) || 0
  const ricaricoValN = parseFloat(ricaricoval) || 0
  const ricarico_calcolato = modoRicarico === 'percentuale'
    ? (dettaglio.totale_riga + posaN) * ricaricoValN / 100
    : ricaricoValN
  const totaleUnitario = dettaglio.totale_riga + posaN + ricarico_calcolato
  const totaleRiga = totaleUnitario * riga.quantita
  const canAdd = riga.larghezza_mm > 0 && riga.altezza_mm > 0

  const handleAdd = () => {
    if (!canAdd) return
    const cfg: ConfigScorrevoleArticolo = {
      riga,
      sconto_vetrata_prisma: scontoVetrata,
      sconto_optional: scontoOptional,
      dettaglio,
      posa: posaN,
      ricarico_percentuale: modoRicarico === 'percentuale' ? ricaricoValN : null,
      ricarico_fisso: modoRicarico === 'fisso' ? ricaricoValN : null,
    }
    const aliquota = aliquote.includes(22) ? 22 : aliquote[0]
    const articolo: ArticoloWizard = {
      tempId: initialValues?.tempId ?? crypto.randomUUID(),
      tipo: 'scorrevole',
      listino_id: null,
      listino_libero_id: null,
      prodotto_id: null,
      accessori_selezionati: null,
      accessori_griglia: null,
      config_scorrevole: cfg,
      tipologia: buildTipologia(riga),
      categoria_nome: 'Vetrate Scorrevoli COPRAL',
      larghezza_mm: riga.larghezza_mm,
      altezza_mm: riga.altezza_mm,
      larghezza_listino_mm: null,
      altezza_listino_mm: null,
      misura_arrotondata: false,
      finitura_nome: riga.colore_struttura_nome,
      finitura_aumento: riga.colore_struttura_maggiorazione,
      finitura_aumento_euro: dettaglio.maggiorazione_colore,
      note: buildNote(cfg),
      immagine_url: null,
      quantita: riga.quantita,
      prezzo_base: dettaglio.prezzo_vetrata,
      prezzo_unitario: totaleUnitario,
      sconto_articolo: 0,
      prezzo_totale_riga: totaleRiga,
      costo_acquisto_unitario: 0,
      costo_posa: posaN,
      aliquota_iva: aliquota,
      ordine: 0,
    }
    onAdd(articolo)
  }

  const lbl = 'text-xs text-gray-500 mb-1 block'
  const inp = 'h-8 text-sm'

  return (
    <div className="p-4 space-y-4 max-w-xl">
      <div className="grid grid-cols-3 gap-3">
        {/* Modello */}
        <div className="col-span-1">
          <label className={lbl}>Modello</label>
          <select value={riga.modello} onChange={(e) => handleModelloChange(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
            {listino.modelli.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        {/* Riferimento */}
        <div className="col-span-2">
          <label className={lbl}>Riferimento</label>
          <Input value={riga.riferimento} onChange={(e) => setRiga(r => ({ ...r, riferimento: e.target.value }))} className={inp} placeholder="es. Veranda sud" />
        </div>
      </div>

      {/* Dimensioni + nr ante + apertura */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-1">
          <label className={lbl}>Largh. (mm)</label>
          <Input type="number" value={riga.larghezza_mm || ''} onChange={(e) => handleDimChange('larghezza_mm', parseFloat(e.target.value) || 0)} className={inp} placeholder="3600" />
        </div>
        <div className="col-span-1">
          <label className={lbl}>Alt. (mm)</label>
          <Input type="number" value={riga.altezza_mm || ''} onChange={(e) => handleDimChange('altezza_mm', parseFloat(e.target.value) || 0)} className={inp} placeholder="2200" />
        </div>
        <div className="col-span-1">
          <label className={lbl}>N. ante{isPrisma ? ' ↺' : ''}</label>
          <Input type={isPrisma ? 'text' : 'number'} value={riga.nr_ante} readOnly={isPrisma}
            onChange={(e) => !isPrisma && setRiga(r => ({ ...r, nr_ante: e.target.value }))}
            className={`${inp} ${isPrisma ? 'bg-gray-50 text-gray-500' : ''}`} />
        </div>
        <div className="col-span-1">
          <label className={lbl}>Apertura</label>
          <select value={riga.apertura} onChange={(e) => setRiga(r => ({ ...r, apertura: e.target.value as RigaScorrevoli['apertura'] }))}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
            <option value="laterale">Laterale</option>
            <option value="centrale">Centrale</option>
            <option value="fisso">Fisso</option>
          </select>
        </div>
        <div className="col-span-1">
          <label className={lbl}>Raccolta</label>
          <select value={riga.raccolta} onChange={(e) => setRiga(r => ({ ...r, raccolta: e.target.value as RigaScorrevoli['raccolta'] }))}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
            <option value="">—</option>
            <option value="destra">Dx</option>
            <option value="sinistra">Sx</option>
          </select>
        </div>
      </div>

      {/* Colore struttura + accessori + vetro */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className={lbl}>Colore struttura</label>
          <select value={riga.colore_struttura_nome} onChange={(e) => handleColoreChange(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white">
            <optgroup label="Standard">
              {coloriDisponibili.filter((c) => c.tipo === 'standard').map((c, i) => (
                <option key={i} value={c.nome}>{c.nome}{c.ral ? ` (${c.ral})` : ''}</option>
              ))}
            </optgroup>
            <optgroup label="Extra (%)">
              {coloriDisponibili.filter((c) => c.tipo === 'extra').map((c, i) => (
                <option key={i} value={c.nome}>{c.nome} +{Math.round(c.maggiorazione * 100)}%</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="col-span-1">
          <label className={lbl}>Colore accessori</label>
          <select value={riga.colore_accessori} onChange={(e) => setRiga(r => ({ ...r, colore_accessori: e.target.value }))}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
            {listino.colori_accessori.map((c, i) => <option key={i} value={c.nome}>{c.nome}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className={lbl}>Vetro</label>
          <select value={riga.tipo_vetro} onChange={(e) => setRiga(r => ({ ...r, tipo_vetro: e.target.value as RigaScorrevoli['tipo_vetro'] }))}
            className="w-full text-sm border rounded px-2 py-1.5 bg-white h-8">
            <option value="standard">Standard</option>
            <option value="extrachiaro">Extrachiaro +70€/mq</option>
            <option value="satinato">Satinato +70€/mq</option>
            <option value="fume">Fumè +70€/mq</option>
          </select>
        </div>
      </div>

      {/* Optional */}
      {optDisponibili.length > 0 && (
        <div>
          <label className={lbl}>Optional</label>
          <div className="space-y-1">
            {optDisponibili.map((o) => {
              const sel = riga.optional.find((r) => r.optional_id === o.id)
              return (
                <div key={o.id}
                  className={`flex items-center gap-2 p-1.5 rounded border text-xs cursor-pointer transition-colors ${sel ? 'border-teal-300 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => toggleOptional(o.id)}>
                  <input type="checkbox" checked={!!sel} readOnly className="h-3 w-3 accent-teal-600" />
                  <span className="flex-1">{o.descrizione}</span>
                  <span className="text-gray-400 shrink-0">{o.prezzo} {o.unita}</span>
                  {sel && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-gray-400">×</span>
                      <Input type="number" min="1" value={sel.quantita}
                        onChange={(e) => updateOptQty(o.id, parseInt(e.target.value) || 1)}
                        className="h-5 w-12 text-xs px-1" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sconti + qty */}
      <div className="grid grid-cols-3 gap-2">
        {isPrisma && (
          <div>
            <label className={lbl}>Sconto vetrata</label>
            <div className="flex items-center gap-1">
              <Input type="number" step="1" min="0" max="100" value={Math.round(scontoVetrata * 100)}
                onChange={(e) => setScontoVetrata(parseFloat(e.target.value) / 100 || 0)}
                className="h-8 text-sm w-16 px-1.5 text-right" />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </div>
        )}
        <div>
          <label className={lbl}>Sconto optional</label>
          <div className="flex items-center gap-1">
            <Input type="number" step="1" min="0" max="100" value={Math.round(scontoOptional * 100)}
              onChange={(e) => setScontoOptional(parseFloat(e.target.value) / 100 || 0)}
              className="h-8 text-sm w-16 px-1.5 text-right" />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </div>
        <div>
          <label className={lbl}>Quantità</label>
          <Input type="number" min="1" value={riga.quantita}
            onChange={(e) => setRiga(r => ({ ...r, quantita: parseInt(e.target.value) || 1 }))}
            className={inp} />
        </div>
        <div>
          <label className={lbl}>Note</label>
          <Input value={riga.note} onChange={(e) => setRiga(r => ({ ...r, note: e.target.value }))} className={inp} placeholder="..." />
        </div>
      </div>

      {/* Posa + Ricarico */}
      <div className="grid grid-cols-2 gap-3 border-t pt-3">
        <div>
          <label className={lbl}>Posa / Mano d&apos;opera (€)</label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={posa}
            onChange={(e) => setPosa(e.target.value)}
            placeholder="0,00"
            className="h-8 text-sm text-right"
          />
        </div>
        <div>
          <label className={lbl}>Ricarico</label>
          <div className="flex gap-1.5">
            <div className="flex rounded-md border overflow-hidden text-xs w-fit shrink-0">
              {(['percentuale', 'fisso'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModoRicarico(m)}
                  className={`px-2 py-1 transition-colors ${modoRicarico === m ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border-l'}`}
                >
                  {m === 'percentuale' ? '%' : '€'}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={0}
              step={modoRicarico === 'percentuale' ? 0.1 : 0.01}
              value={ricaricoval}
              onChange={(e) => setRicaricoVal(e.target.value)}
              placeholder={modoRicarico === 'percentuale' ? '0,0' : '0,00'}
              className="h-8 text-sm text-right flex-1"
            />
          </div>
        </div>
      </div>

      {/* Preview prezzo */}
      {dettaglio.mq_fatturati > 0 && (
        <div className="rounded-lg border bg-teal-50 p-3 text-xs space-y-0.5">
          <div className="flex justify-between text-gray-600">
            <span>{dettaglio.mq_fatturati} mq × {dettaglio.prezzo_mq} €/mq</span>
            <span>€ {formatEuroScorrevoli(dettaglio.prezzo_vetrata)}</span>
          </div>
          {dettaglio.sconto_vetrata > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Sconto vetrata {Math.round(scontoVetrata * 100)}%</span>
              <span>−€ {formatEuroScorrevoli(dettaglio.sconto_vetrata)}</span>
            </div>
          )}
          {dettaglio.maggiorazione_colore > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Magg. colore +{Math.round(riga.colore_struttura_maggiorazione * 100)}%</span>
              <span>+€ {formatEuroScorrevoli(dettaglio.maggiorazione_colore)}</span>
            </div>
          )}
          {dettaglio.prezzo_vetro_extra > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Vetro speciale</span>
              <span>+€ {formatEuroScorrevoli(dettaglio.prezzo_vetro_extra)}</span>
            </div>
          )}
          {dettaglio.totale_optional > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Optional (netto)</span>
              <span>+€ {formatEuroScorrevoli(dettaglio.totale_optional_netto)}</span>
            </div>
          )}
          {posaN > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Posa</span>
              <span>+€ {formatEuro(posaN)}</span>
            </div>
          )}
          {ricarico_calcolato > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Ricarico {modoRicarico === 'percentuale' ? `(${ricaricoValN}%)` : ''}</span>
              <span>+€ {formatEuro(ricarico_calcolato)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-teal-800 border-t pt-0.5 mt-0.5">
            <span>Totale × {riga.quantita}</span>
            <span>€ {formatEuro(totaleRiga)}</span>
          </div>
        </div>
      )}

      <Button onClick={handleAdd} disabled={!canAdd} className="w-full">
        <Plus className="h-4 w-4 mr-1.5" />
        {isEditing ? 'Aggiorna' : 'Aggiungi al preventivo'}
      </Button>
    </div>
  )
}
