'use client'

import { useRef, useState, useTransition } from 'react'
import { ArrowLeft, Save, AlertTriangle, Info, Upload, X } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { getCurrentOrgId } from '@/actions/listini'
import { saveScorevoliListino, type ScorevoliListino } from '@/actions/scorrevoli'

async function resizeImage(file: File, maxDim = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas error'))), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

const MODELLO_LABEL: Record<string, string> = {
  alpha: 'Alpha',
  alpha_plus: 'Alpha Plus',
  maxima: 'Maxima',
  prisma: 'Prisma',
}

function NumInput({
  value,
  onChange,
  suffix,
  className,
}: {
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Input
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value === '' ? null : parseFloat(e.target.value)
          onChange(isNaN(v as number) ? null : v)
        }}
        className="h-7 text-sm w-24 px-2"
      />
      {suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
    </div>
  )
}

function PctInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step="1"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v / 100)
        }}
        className="h-7 text-sm w-20 px-2"
      />
      <span className="text-xs text-gray-400">%</span>
    </div>
  )
}

// ─── TAB: MODELLI ────────────────────────────────────────────────────────────

function TabModelli({
  data,
  onChange,
}: {
  data: ScorevoliListino
  onChange: (d: ScorevoliListino) => void
}) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  const updateModello = (idx: number, field: string, value: unknown) => {
    const modelli = data.modelli.map((m, i) =>
      i === idx ? { ...m, [field]: value } : m
    )
    onChange({ ...data, modelli })
  }

  const updateFascia = (mIdx: number, fIdx: number, field: string, value: number) => {
    const modelli = data.modelli.map((m, i) => {
      if (i !== mIdx) return m
      const fasce = (m.prezzo_mq_fasce ?? []).map((f, j) =>
        j === fIdx ? { ...f, [field]: value } : f
      )
      return { ...m, prezzo_mq_fasce: fasce }
    })
    onChange({ ...data, modelli })
  }

  const handleImageUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingIdx(idx)
    try {
      const blob = await resizeImage(file, 800)
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const fileName = `${orgId}/scorrevoli-${data.modelli[idx].id}.webp`
      const { error } = await supabase.storage
        .from('listini-immagini')
        .upload(fileName, blob, { contentType: 'image/webp', upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('listini-immagini')
        .getPublicUrl(fileName)
      updateModello(idx, 'immagine_url', publicUrl)
      toast.success('Immagine caricata')
    } catch {
      toast.error('Errore nel caricamento immagine')
    } finally {
      setUploadingIdx(null)
      const ref = fileRefs.current[idx]
      if (ref) ref.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {data.modelli.map((m, idx) => (
        <div key={m.id} className="border rounded-lg p-4 bg-white">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-base">{m.nome}</h3>
            <Badge variant="outline" className="text-xs">{m.id}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {/* prezzo mq fisso */}
            {m.prezzo_mq !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Prezzo €/mq</span>
                <NumInput
                  value={m.prezzo_mq}
                  onChange={(v) => updateModello(idx, 'prezzo_mq', v ?? 0)}
                  suffix="€/mq"
                />
              </div>
            )}

            {/* fasce prezzo Prisma */}
            {m.prezzo_mq_fasce && (
              <div className="col-span-2">
                <p className="text-gray-500 text-xs mb-2">Fasce di prezzo per altezza</p>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Fascia</th>
                        <th className="text-left px-3 py-2 font-medium">H max (mm)</th>
                        <th className="text-left px-3 py-2 font-medium">Prezzo €/mq</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.prezzo_mq_fasce.map((f, fIdx) => (
                        <tr key={fIdx} className="border-t">
                          <td className="px-3 py-2 text-gray-600">{f.fascia}</td>
                          <td className="px-3 py-2">
                            <NumInput
                              value={f.altezza_max_mm}
                              onChange={(v) => updateFascia(idx, fIdx, 'altezza_max_mm', v ?? 0)}
                              suffix="mm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumInput
                              value={f.prezzo_mq}
                              onChange={(v) => updateFascia(idx, fIdx, 'prezzo_mq', v ?? 0)}
                              suffix="€/mq"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-gray-600">H min fatturazione</span>
              <NumInput
                value={m.altezza_min_fatturazione_mm}
                onChange={(v) => updateModello(idx, 'altezza_min_fatturazione_mm', v ?? 0)}
                suffix="mm"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">H max sistema</span>
              <NumInput
                value={m.altezza_max_mm}
                onChange={(v) => updateModello(idx, 'altezza_max_mm', v ?? 0)}
                suffix="mm"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Larghezza anta min</span>
              <NumInput
                value={m.larghezza_anta_min_mm}
                onChange={(v) => updateModello(idx, 'larghezza_anta_min_mm', v ?? 0)}
                suffix="mm"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Larghezza anta max</span>
              <NumInput
                value={m.larghezza_anta_max_mm}
                onChange={(v) => updateModello(idx, 'larghezza_anta_max_mm', v ?? 0)}
                suffix="mm"
              />
            </div>

            {m.mq_minimi_fatturazione !== null && m.mq_minimi_fatturazione !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Mq minimi fatturazione</span>
                <NumInput
                  value={m.mq_minimi_fatturazione}
                  onChange={(v) => updateModello(idx, 'mq_minimi_fatturazione', v)}
                  suffix="mq"
                />
              </div>
            )}
          </div>

          {m.note && (
            <p className="mt-3 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 flex gap-1.5 items-start">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {m.note}
            </p>
          )}

          {/* Immagine modello */}
          <div className="mt-4 border-t pt-4">
            <p className="text-xs text-gray-500 mb-2">Immagine modello (visibile in preventivo)</p>
            <div className="flex items-start gap-3">
              {m.immagine_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.immagine_url}
                    alt={m.nome}
                    className="h-24 w-auto rounded border border-gray-200 object-contain bg-gray-50"
                  />
                  <div className="flex flex-col gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileRefs.current[idx]?.click()}
                      disabled={uploadingIdx === idx}
                      className="text-xs h-7"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Sostituisci
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateModello(idx, 'immagine_url', null)}
                      className="text-xs h-7 text-red-600 hover:text-red-700"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Rimuovi
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRefs.current[idx]?.click()}
                  disabled={uploadingIdx === idx}
                  className="text-xs h-7"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {uploadingIdx === idx ? 'Caricamento…' : 'Carica immagine'}
                </Button>
              )}
              <input
                ref={(el) => { fileRefs.current[idx] = el }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleImageUpload(idx, e)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TAB: CONFIGURAZIONI ─────────────────────────────────────────────────────

function TabConfigurazioni({
  data,
  onChange,
}: {
  data: ScorevoliListino
  onChange: (d: ScorevoliListino) => void
}) {
  const [filtroModello, setFiltroModello] = useState('tutti')
  const [filtroApertura, setFiltroApertura] = useState('tutti')

  const updatePrezzo = (idx: number, value: number) => {
    const configurazioni_fisse = data.configurazioni_fisse.map((c, i) =>
      i === idx ? { ...c, prezzo: value } : c
    )
    onChange({ ...data, configurazioni_fisse })
  }

  const filtered = data.configurazioni_fisse.filter((c) => {
    if (filtroModello !== 'tutti' && c.modello !== filtroModello) return false
    if (filtroApertura !== 'tutti' && c.apertura !== filtroApertura) return false
    return true
  })

  const modelli = [...new Set(data.configurazioni_fisse.map((c) => c.modello))]
  const aperture = [...new Set(data.configurazioni_fisse.map((c) => c.apertura))]

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <select
          value={filtroModello}
          onChange={(e) => setFiltroModello(e.target.value)}
          className="text-sm border rounded px-2 py-1.5 bg-white"
        >
          <option value="tutti">Tutti i modelli</option>
          {modelli.map((m) => (
            <option key={m} value={m}>{MODELLO_LABEL[m] ?? m}</option>
          ))}
        </select>
        <select
          value={filtroApertura}
          onChange={(e) => setFiltroApertura(e.target.value)}
          className="text-sm border rounded px-2 py-1.5 bg-white"
        >
          <option value="tutti">Tutte le aperture</option>
          {aperture.map((a) => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtered.length} configurazioni</span>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Modello</th>
              <th className="text-left px-3 py-2 font-medium">Apertura</th>
              <th className="text-right px-3 py-2 font-medium">N. ante</th>
              <th className="text-right px-3 py-2 font-medium">L max (mm)</th>
              <th className="text-right px-3 py-2 font-medium">H max (mm)</th>
              <th className="text-right px-3 py-2 font-medium">Prezzo €</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c, i) => {
              const globalIdx = data.configurazioni_fisse.indexOf(c)
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className="text-xs font-normal">
                      {MODELLO_LABEL[c.modello] ?? c.modello}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 capitalize">{c.apertura}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.nr_ante}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.larghezza_max_mm}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.altezza_max_mm}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        value={c.prezzo}
                        onChange={(e) => updatePrezzo(globalIdx, parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm w-24 px-2 text-right"
                      />
                      <span className="text-xs text-gray-400">€</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TAB: COLORI ─────────────────────────────────────────────────────────────

function TabColori({
  data,
  onChange,
}: {
  data: ScorevoliListino
  onChange: (d: ScorevoliListino) => void
}) {
  const updateColore = (idx: number, field: string, value: unknown) => {
    const colori_struttura = data.colori_struttura.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    )
    onChange({ ...data, colori_struttura })
  }

  const standard = data.colori_struttura.filter((c) => c.tipo === 'standard')
  const extra = data.colori_struttura.filter((c) => c.tipo === 'extra')

  const renderTable = (colori: typeof data.colori_struttura, label: string, badgeClass: string) => (
    <div className="mb-6">
      <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${badgeClass}`} />
        {label}
      </h3>
      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nome colore</th>
              <th className="text-left px-3 py-2 font-medium">RAL / Codice</th>
              <th className="text-left px-3 py-2 font-medium">Modelli</th>
              <th className="text-right px-3 py-2 font-medium">Maggiorazione</th>
              <th className="text-left px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {colori.map((c) => {
              const globalIdx = data.colori_struttura.indexOf(c)
              return (
                <tr key={globalIdx} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-medium">{c.nome}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{c.ral ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {c.modelli_applicabili.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs px-1 py-0">
                          {MODELLO_LABEL[m] ?? m}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {c.tipo === 'extra' ? (
                      <PctInput
                        value={c.maggiorazione}
                        onChange={(v) => updateColore(globalIdx, 'maggiorazione', v)}
                      />
                    ) : (
                      <span className="text-green-600 text-xs">Incluso</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-400">{c.nota ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div>
      {renderTable(standard, 'Colori standard (inclusi nel prezzo)', 'bg-green-400')}
      {renderTable(extra, 'Colori extra (maggiorazione %)', 'bg-amber-400')}

      <div className="mt-4">
        <h3 className="font-medium text-sm mb-2">Colori accessori disponibili</h3>
        <div className="flex gap-2 flex-wrap">
          {data.colori_accessori.map((c, i) => (
            <Badge key={i} variant="secondary">{c.nome}</Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TAB: OPTIONAL ───────────────────────────────────────────────────────────

function TabOptional({
  data,
  onChange,
}: {
  data: ScorevoliListino
  onChange: (d: ScorevoliListino) => void
}) {
  const [filtro, setFiltro] = useState('tutti')

  const updateOptional = (idx: number, field: string, value: unknown) => {
    const optional = data.optional.map((o, i) =>
      i === idx ? { ...o, [field]: value } : o
    )
    onChange({ ...data, optional })
  }

  const modelli = [...new Set(data.optional.flatMap((o) => o.modelli_applicabili))]
  const filtered = filtro === 'tutti'
    ? data.optional
    : data.optional.filter((o) => o.modelli_applicabili.includes(filtro))

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="text-sm border rounded px-2 py-1.5 bg-white"
        >
          <option value="tutti">Tutti i modelli</option>
          {modelli.map((m) => (
            <option key={m} value={m}>{MODELLO_LABEL[m] ?? m}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 self-center">{filtered.length} voci</span>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Descrizione</th>
              <th className="text-left px-3 py-2 font-medium">Modelli</th>
              <th className="text-right px-3 py-2 font-medium">Prezzo</th>
              <th className="text-left px-3 py-2 font-medium">Unità</th>
              <th className="text-left px-3 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((o) => {
              const globalIdx = data.optional.indexOf(o)
              return (
                <tr key={globalIdx} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 max-w-xs">{o.descrizione}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {o.modelli_applicabili.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs px-1 py-0">
                          {MODELLO_LABEL[m] ?? m}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {o.prezzo !== null ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          value={o.prezzo ?? ''}
                          onChange={(e) =>
                            updateOptional(globalIdx, 'prezzo', parseFloat(e.target.value) || 0)
                          }
                          className="h-7 text-sm w-24 px-2 text-right"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">a preventivo</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    <Input
                      value={o.unita}
                      onChange={(e) => updateOptional(globalIdx, 'unita', e.target.value)}
                      className="h-7 text-sm w-28 px-2"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-400 max-w-xs">{o.nota ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TAB: PARAMETRI COMMERCIALI ──────────────────────────────────────────────

function TabParametri({
  data,
  onChange,
}: {
  data: ScorevoliListino
  onChange: (d: ScorevoliListino) => void
}) {
  const p = data.parametri_commerciali

  const updateParam = (key: keyof typeof p, valore: number | null) => {
    if (key === '_nota') return
    const param = p[key] as { valore: number | null; descrizione: string; editabile: boolean }
    onChange({
      ...data,
      parametri_commerciali: {
        ...p,
        [key]: { ...param, valore },
      },
    })
  }

  const rows: { key: keyof typeof p; label: string; tipo: 'pct' | 'euro' | 'euro_null' }[] = [
    { key: 'sconto_vetrata_prisma', label: 'Sconto su vetrata Prisma (default)', tipo: 'pct' },
    { key: 'sconto_optional', label: 'Sconto su optional (default, tutti i modelli)', tipo: 'pct' },
    { key: 'trasporto', label: 'Trasporto (% su totale documento)', tipo: 'pct' },
    { key: 'iva', label: 'IVA', tipo: 'pct' },
    { key: 'margine_alm', label: 'Margine ALM (da impostare per commessa)', tipo: 'euro_null' },
  ]

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-gray-500">{p._nota}</p>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Parametro</th>
              <th className="text-left px-4 py-2 font-medium">Valore default</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ key, label, tipo }) => {
              const param = p[key] as { valore: number | null; descrizione: string; editabile: boolean }
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{label}</td>
                  <td className="px-4 py-2">
                    {tipo === 'pct' ? (
                      <PctInput
                        value={(param.valore as number) ?? 0}
                        onChange={(v) => updateParam(key, v)}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          placeholder="non impostato"
                          value={param.valore ?? ''}
                          onChange={(e) =>
                            updateParam(key, e.target.value === '' ? null : parseFloat(e.target.value) || 0)
                          }
                          className="h-7 text-sm w-32 px-2"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded p-3 flex gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-amber-700">
          <p className="font-medium">Parametri editabili per commessa</p>
          <p className="text-xs mt-1">
            I valori qui sopra sono i default da listino fornitore. In fase di preventivo ogni valore
            potrà essere sovrascritto per la singola commessa. Il <strong>margine ALM</strong> non
            è nel listino fornitore e va impostato separatamente.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────

export default function ScorevoliEditor({ initialData }: { initialData: ScorevoliListino }) {
  const [data, setData] = useState<ScorevoliListino>(initialData)
  const [dirty, setDirty] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleChange = (newData: ScorevoliListino) => {
    setData(newData)
    setDirty(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveScorevoliListino(data)
      if (result.error) {
        toast.error(`Errore: ${result.error}`)
      } else {
        setDirty(false)
        toast.success('Listino salvato')
      }
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/listini" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              Listino Scorrevoli {data._meta.fornitore}
            </h1>
            {dirty && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                Non salvato
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 ml-6">
            <span className="text-xs text-gray-400">Nome fornitore:</span>
            <Input
              value={data._meta.fornitore}
              onChange={(e) => handleChange({ ...data, _meta: { ...data._meta, fornitore: e.target.value } })}
              className="h-6 text-xs w-32 px-2"
              placeholder="es. COPRAL"
            />
            <span className="text-xs text-gray-400">
              · vers. {data._meta.fonte.match(/vers\.\s*[\d.]+/)?.[0] ?? ''} ·
              Estratto il {data._meta.data_estrazione}
            </span>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!dirty || isPending}>
          <Save className="h-4 w-4 mr-1.5" />
          {isPending ? 'Salvataggio…' : 'Salva modifiche'}
        </Button>
      </div>

      {/* Alert discrepanze */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <span className="font-medium">4 punti da verificare con il fornitore: </span>
          Serratura centrale (323 vs 500 €) · Prezzo anonimo 320 €/pz · Prezzo anonimo 60 €/pz ·
          Profilo L 50×20 vs 50×30.{' '}
          <span className="underline cursor-pointer" onClick={() =>
            window.open('/data/scorrevoli/report_estrazione.md', '_blank')
          }>
            Vedi report completo
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="modelli">
        <TabsList className="mb-4">
          <TabsTrigger value="modelli">Modelli ({data.modelli.length})</TabsTrigger>
          <TabsTrigger value="configurazioni">Configurazioni ({data.configurazioni_fisse.length})</TabsTrigger>
          <TabsTrigger value="colori">Colori ({data.colori_struttura.length})</TabsTrigger>
          <TabsTrigger value="optional">Optional ({data.optional.length})</TabsTrigger>
          <TabsTrigger value="parametri">Parametri commerciali</TabsTrigger>
        </TabsList>

        <TabsContent value="modelli">
          <TabModelli data={data} onChange={handleChange} />
        </TabsContent>
        <TabsContent value="configurazioni">
          <TabConfigurazioni data={data} onChange={handleChange} />
        </TabsContent>
        <TabsContent value="colori">
          <TabColori data={data} onChange={handleChange} />
        </TabsContent>
        <TabsContent value="optional">
          <TabOptional data={data} onChange={handleChange} />
        </TabsContent>
        <TabsContent value="parametri">
          <TabParametri data={data} onChange={handleChange} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
