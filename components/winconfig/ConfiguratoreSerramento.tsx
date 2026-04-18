'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type {
  FormaSerramento, LatoInclinazione, TipoApertura, VersoApertura,
  WcSerieCompleta, WcColore, WcRiempimento, ConfigWinConfig,
} from '@/types/winconfig'
import { calcolaWinConfig } from '@/lib/winconfig-geometry'
import { formatEuro } from '@/lib/pricing'
import CanvasSerramento from './CanvasSerramento'
import DistintaMateriali from './DistintaMateriali'

type Props = {
  serie: WcSerieCompleta[]
  riempimentiGlobali: WcRiempimento[]
  onSalva: (config: ConfigWinConfig, quantita: number, note: string) => Promise<void>
  onAnnulla?: () => void
  initialMisure?: { larghezza: number; altezza_sx: number; altezza_dx: number; quantita: number }
}

const TIPO_APERTURA_LABELS: Record<TipoApertura, string> = {
  battente: 'Battente',
  vasistas: 'Vasistas',
  anta_ribalta: 'Anta-Ribalta',
  fisso: 'Fisso',
  scorrevole: 'Scorrevole',
}

export default function ConfiguratoreSerramento({
  serie, riempimentiGlobali, onSalva, onAnnulla, initialMisure,
}: Props) {
  // ---- State configurazione ----
  const [serieId, setSerieId] = useState<string>(serie[0]?.id ?? '')
  const [forma, setForma] = useState<FormaSerramento>('rettangolare')
  const [latoInclinazione, setLatoInclinazione] = useState<LatoInclinazione>('testa')
  const [larghezza, setLarghezza] = useState(initialMisure?.larghezza ?? 1200)
  const [altezzaSx, setAltezzaSx] = useState(initialMisure?.altezza_sx ?? 1400)
  const [altezzaDx, setAltezzaDx] = useState(initialMisure?.altezza_dx ?? 1400)
  const [tipoApertura, setTipoApertura] = useState<TipoApertura>('battente')
  const [versoApertura, setVersoApertura] = useState<VersoApertura>('dx')
  const [nAnte, setNAnte] = useState(1)
  const [coloreId, setColoreId] = useState<string>('')
  const [riempimentoId, setRiempimentoId] = useState<string>('')
  const [quantita, setQuantita] = useState(initialMisure?.quantita ?? 1)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const serieSelezionata = serie.find(s => s.id === serieId) ?? null
  const riempimentiDisponibili = [
    ...(serieSelezionata?.riempimenti ?? []),
    ...riempimentiGlobali.filter(r => !r.serie_id),
  ]
  const coloreSelezionato = serieSelezionata?.colori.find(c => c.id === coloreId) ?? null
  const riempimentoSelezionato = riempimentiDisponibili.find(r => r.id === riempimentoId) ?? null

  // Quando cambia serie reset colore/riempimento
  useEffect(() => {
    setColoreId('')
    setRiempimentoId('')
  }, [serieId])

  // Altezza dx segue sx in modalità rettangolare
  useEffect(() => {
    if (forma === 'rettangolare') setAltezzaDx(altezzaSx)
  }, [forma, altezzaSx])

  // ---- Calcolo distinta ----
  const calcolo = serieSelezionata
    ? calcolaWinConfig({
        serie: serieSelezionata,
        profili: serieSelezionata.profili,
        accessori: serieSelezionata.accessori,
        riempimento: riempimentoSelezionato,
        colore: coloreSelezionato,
        forma,
        latoInclinazione: forma === 'fuori_squadro' ? latoInclinazione : null,
        larghezza_mm: larghezza,
        altezza_sx_mm: altezzaSx,
        altezza_dx_mm: forma === 'fuori_squadro' ? altezzaDx : altezzaSx,
        tipoApertura,
        nAnte,
      })
    : null

  // ---- Salvataggio ----
  const handleSalva = useCallback(async () => {
    if (!serieSelezionata || !calcolo) {
      toast.error('Seleziona una serie valida')
      return
    }
    if (larghezza < 100 || altezzaSx < 100) {
      toast.error('Misure troppo piccole (min 100 mm)')
      return
    }
    setSaving(true)
    try {
      const altezzaDxEff = forma === 'fuori_squadro' ? altezzaDx : altezzaSx
      const config: ConfigWinConfig = {
        serie_id: serieSelezionata.id,
        serie_nome: serieSelezionata.nome,
        materiale: serieSelezionata.materiale,
        sfrido_nodo_mm: serieSelezionata.sfrido_nodo_mm,
        sfrido_angolo_mm: serieSelezionata.sfrido_angolo_mm,
        forma,
        lato_inclinazione: forma === 'fuori_squadro' ? latoInclinazione : null,
        larghezza_mm: larghezza,
        altezza_sx_mm: altezzaSx,
        altezza_dx_mm: altezzaDxEff,
        tipo_apertura: tipoApertura,
        verso_apertura: tipoApertura !== 'fisso' ? versoApertura : null,
        n_ante: nAnte,
        colore_id: coloreId || null,
        colore_nome: coloreSelezionato?.nome ?? null,
        bicolore: false,
        colore_esterno_id: null,
        colore_esterno_nome: null,
        riempimento_id: riempimentoId || null,
        riempimento_nome: riempimentoSelezionato?.nome ?? null,
        distinta: calcolo.distinta,
        prezzo_profili: calcolo.prezzo_profili,
        prezzo_accessori: calcolo.prezzo_accessori,
        prezzo_riempimenti: calcolo.prezzo_riempimenti,
        prezzo_colore: calcolo.prezzo_colore,
        prezzo_totale: calcolo.prezzo_totale,
        costo_profili: calcolo.costo_profili,
        costo_accessori: calcolo.costo_accessori,
        costo_riempimenti: calcolo.costo_riempimenti,
        costo_totale: calcolo.costo_totale,
      }
      await onSalva(config, quantita, note)
      toast.success('Serramento aggiunto al preventivo')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore durante il salvataggio')
    } finally {
      setSaving(false)
    }
  }, [
    serieSelezionata, calcolo, forma, latoInclinazione, larghezza, altezzaSx, altezzaDx,
    tipoApertura, versoApertura, nAnte, coloreId, coloreSelezionato, riempimentoId,
    riempimentoSelezionato, quantita, note, onSalva,
  ])

  if (serie.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="text-lg font-medium">Nessuna serie configurata</p>
        <p className="text-sm mt-1">Vai in <strong>WinConfig → Serie</strong> per creare una serie di profili.</p>
      </div>
    )
  }

  const altezzaDxEff = forma === 'fuori_squadro' ? altezzaDx : altezzaSx

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* COLONNA SX: configurazione */}
      <div className="space-y-5">

        {/* Serie */}
        <div className="space-y-1.5">
          <Label>Serie profili</Label>
          <Select value={serieId} onValueChange={setSerieId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona serie..." />
            </SelectTrigger>
            <SelectContent>
              {serie.filter(s => s.attiva).map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                  <span className="ml-2 text-xs text-slate-400">{s.materiale}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Forma */}
        <div className="space-y-2">
          <Label>Forma</Label>
          <div className="flex gap-4">
            {(['rettangolare','fuori_squadro'] as FormaSerramento[]).map(f => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="forma" value={f} checked={forma === f}
                  onChange={() => setForma(f)} className="accent-blue-600" />
                <span className="text-sm">{f === 'rettangolare' ? 'Rettangolare' : 'Fuori squadro'}</span>
              </label>
            ))}
          </div>

          {forma === 'fuori_squadro' && (
            <div className="ml-2">
              <Label className="text-xs text-slate-500 mb-1 block">Lato inclinato</Label>
              <div className="flex gap-4">
                {(['testa','base'] as LatoInclinazione[]).map(l => (
                  <label key={l} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="lato" value={l} checked={latoInclinazione === l}
                      onChange={() => setLatoInclinazione(l)} className="accent-blue-600" />
                    <span className="text-sm">{l === 'testa' ? 'Testa inclinata' : 'Base inclinata'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Misure */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="larghezza">Larghezza (mm)</Label>
            <Input
              id="larghezza"
              type="number"
              min={100}
              max={8000}
              value={larghezza}
              onChange={e => setLarghezza(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="altezza-sx">
              {forma === 'fuori_squadro' ? 'Altezza SX (mm)' : 'Altezza (mm)'}
            </Label>
            <Input
              id="altezza-sx"
              type="number"
              min={100}
              max={8000}
              value={altezzaSx}
              onChange={e => setAltezzaSx(parseInt(e.target.value) || 0)}
            />
          </div>
          {forma === 'fuori_squadro' && (
            <div className="space-y-1">
              <Label htmlFor="altezza-dx">Altezza DX (mm)</Label>
              <Input
                id="altezza-dx"
                type="number"
                min={100}
                max={8000}
                value={altezzaDx}
                onChange={e => setAltezzaDx(parseInt(e.target.value) || 0)}
              />
            </div>
          )}
        </div>

        {/* Apertura */}
        <div className="space-y-2">
          <Label>Tipo apertura</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TIPO_APERTURA_LABELS) as TipoApertura[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoApertura(t)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  tipoApertura === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-300 text-slate-600 hover:border-blue-400'
                }`}
              >
                {TIPO_APERTURA_LABELS[t]}
              </button>
            ))}
          </div>

          {tipoApertura !== 'fisso' && tipoApertura !== 'scorrevole' && (
            <div className="flex items-center gap-4 mt-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Verso apertura</Label>
                <div className="flex gap-3">
                  {(['sx','dx'] as VersoApertura[]).map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="verso" value={v} checked={versoApertura === v}
                        onChange={() => setVersoApertura(v)} className="accent-blue-600" />
                      <span className="text-sm uppercase">{v}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">N. ante</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={nAnte}
                  onChange={e => setNAnte(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16"
                />
              </div>
            </div>
          )}
        </div>

        {/* Colore */}
        {(serieSelezionata?.colori.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <Label>Colore</Label>
            <Select value={coloreId} onValueChange={setColoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessun colore (grezzo)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Grezzo / Nessun colore</SelectItem>
                {serieSelezionata!.colori.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                    {c.codice_ral && <span className="ml-2 text-xs text-slate-400">RAL {c.codice_ral}</span>}
                    {c.valore_sovrapprezzo > 0 && (
                      <span className="ml-2 text-xs text-blue-500">
                        +{c.tipo_sovrapprezzo === 'percentuale'
                          ? `${c.valore_sovrapprezzo}%`
                          : formatEuro(c.valore_sovrapprezzo)
                        }
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Riempimento */}
        {riempimentiDisponibili.length > 0 && (
          <div className="space-y-1.5">
            <Label>Riempimento (vetro / pannello)</Label>
            <Select value={riempimentoId} onValueChange={setRiempimentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessun riempimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nessuno</SelectItem>
                {riempimentiDisponibili.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                    {r.spessore_mm && <span className="ml-2 text-xs text-slate-400">{r.spessore_mm} mm</span>}
                    <span className="ml-2 text-xs text-slate-400">{formatEuro(r.prezzo_mq)}/m²</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Quantita e note */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="qty">Quantità</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={quantita}
              onChange={e => setQuantita(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="note-wc">Note</Label>
            <Input
              id="note-wc"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="es. Stanza 1"
            />
          </div>
        </div>

        {/* Azioni */}
        <div className="flex gap-3 pt-2">
          {onAnnulla && (
            <Button type="button" variant="outline" onClick={onAnnulla} className="flex-1">
              Annulla
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSalva}
            disabled={saving || !serieSelezionata}
            className="flex-1"
          >
            {saving ? 'Salvataggio...' : 'Aggiungi al preventivo'}
          </Button>
        </div>
      </div>

      {/* COLONNA DX: canvas + distinta */}
      <div className="space-y-4">
        {/* SVG Preview */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <CanvasSerramento
            forma={forma}
            latoInclinazione={forma === 'fuori_squadro' ? latoInclinazione : null}
            larghezza_mm={larghezza}
            altezza_sx_mm={altezzaSx}
            altezza_dx_mm={altezzaDxEff}
            tipoApertura={tipoApertura}
            versoApertura={tipoApertura !== 'fisso' ? versoApertura : null}
            nAnte={nAnte}
          />
        </div>

        {/* Totale rapido */}
        {calcolo && (
          <div className="bg-blue-50 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-blue-700">
              <span className="font-medium">Prezzo unitario: </span>
              {formatEuro(calcolo.prezzo_totale)}
            </div>
            <div className="text-sm text-blue-700">
              <span className="font-medium">Totale ×{quantita}: </span>
              {formatEuro(calcolo.prezzo_totale * quantita)}
            </div>
          </div>
        )}

        {/* Distinta materiali */}
        {calcolo && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-3 text-sm">Distinta materiali</h3>
            <DistintaMateriali
              distinta={calcolo.distinta}
              prezzo_profili={calcolo.prezzo_profili}
              prezzo_accessori={calcolo.prezzo_accessori}
              prezzo_riempimenti={calcolo.prezzo_riempimenti}
              prezzo_colore={calcolo.prezzo_colore}
              prezzo_totale={calcolo.prezzo_totale}
            />
          </div>
        )}
      </div>
    </div>
  )
}
