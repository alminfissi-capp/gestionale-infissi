'use client'

import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Pencil, Trash2, Plus, Save, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── TYPES ────────────────────────────────────────────────────────────────── */
type DbItem = { id: string; label: string; categoria: string; prezzo: number; magazzino_prodotto_id?: string | null }
type CrudOps = {
  onAdd: (item: Omit<DbItem, 'id'>) => Promise<void>
  onUpdate: (item: DbItem) => Promise<void>
  onDelete: (id: string) => Promise<void>
}
type TableCrud = CrudOps & { items: DbItem[] }

/* ── COSTANTI ─────────────────────────────────────────────────────────────── */
const fmt = (v: number) => `€ ${Number(v).toFixed(2)}`
const CAT_PIENE   = ['quadro', 'piatta', 'tondo', 'scatolato', 'altro']
const CAT_COLONNA = ['tubo_quadro', 'tubo_rett', 'profilo_L', 'altro']
const CAT_BINARIO = ['binario', 'binario_motorizzato', 'altro']
const CAT_ACC     = ['cardini', 'serrature', 'maniglie', 'chiusure', 'scorrevole', 'automatismi', 'altro']
const TIPI = [
  { id: 'battente',   label: 'Cancello Battente'  },
  { id: 'scorrevole', label: 'Cancello Scorrevole' },
  { id: 'cancellata', label: 'Cancellata'          },
]

/* ── OTTIMIZZAZIONE ───────────────────────────────────────────────────────── */
function ottimizza(nPezzi: number, pezzo_m: number) {
  if (nPezzi <= 0 || pezzo_m <= 0) return { pezziPerBarra: 0, barre6m: 0, sfridoM: 0, sfridoPerc: 0 }
  const pezziPerBarra = Math.floor(6 / pezzo_m)
  const barre6m = Math.ceil(nPezzi / (pezziPerBarra || 1))
  const sfridoM = parseFloat((barre6m * 6 - nPezzi * pezzo_m).toFixed(3))
  return { pezziPerBarra, barre6m, sfridoM, sfridoPerc: (sfridoM / (barre6m * 6)) * 100 }
}

/* ── PREVIEW SVG ──────────────────────────────────────────────────────────── */
function Preview({ tipo, geo, colonne, barreV, pannello }: {
  tipo: string
  geo: { larghezza: number; altezza: number; nAnte: number }
  colonne: { attivo: boolean; nColonne: number }
  barreV: { attivo: boolean; interasse: number }
  pannello: { attivo: boolean; altezzaZona: number }
}) {
  const W = 300, H = 170, PAD = 26
  const larg_m = geo.larghezza / 100, alt_m = geo.altezza / 100
  const nAnte = (tipo === 'battente' || tipo === 'scorrevole') ? geo.nAnte : 1
  const scale = Math.min((W - PAD * 2) / larg_m, (H - PAD * 2 - 20) / alt_m)
  const gW = larg_m * scale, gH = alt_m * scale
  const ox = PAD + ((W - PAD * 2) - gW) / 2, oy = PAD + 4
  const antaW = gW / nAnte
  const nBarre = Math.max(0, Math.ceil((larg_m / nAnte) / (barreV.interasse / 100)) - 1)
  const pannH = pannello.attivo ? (pannello.altezzaZona / geo.altezza) * gH : 0
  const CW = 7
  const nCol = colonne.attivo ? colonne.nColonne : 0
  const colPos: number[] = []
  for (let i = 0; i < nCol; i++) {
    if (i === 0) colPos.push(ox - CW - 2)
    else if (i === nCol - 1) colPos.push(ox + gW + 2)
    else colPos.push(ox + (gW / (nCol - 1)) * i - CW / 2)
  }
  const binH = 6, binY = oy + gH + 12
  const binW = tipo === 'scorrevole' ? gW * 2 : 0
  const binX = tipo === 'scorrevole' ? ox - gW / 2 : 0
  const scorrevoleOffset = tipo === 'scorrevole' ? gW * 0.35 : 0

  const FRAME   = tipo === 'scorrevole' ? '#7c3aed' : '#2563eb'
  const COLONNE = '#1d4ed8'
  const BINARIO = '#7c3aed'
  const PANEL   = 'rgba(59,130,246,0.18)'
  const BARRE   = '#94a3b8'
  const DIM     = '#94a3b8'

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
      {tipo === 'scorrevole' && <>
        <rect x={binX} y={binY} width={binW} height={binH} rx={2} fill="#e2d9f3" stroke={BINARIO} strokeWidth={1.5} />
        <line x1={binX} y1={binY + binH / 2} x2={binX + binW} y2={binY + binH / 2} stroke={BINARIO} strokeWidth={0.5} strokeDasharray="4 3" />
        <text x={binX + binW / 2} y={binY + binH + 11} textAnchor="middle" fill={BINARIO} fontSize={8} fontFamily="monospace">binario {(geo.larghezza / 100 * 2).toFixed(1)}m</text>
      </>}
      {colPos.map((cx, i) => (
        <g key={i}>
          <rect x={cx} y={oy} width={CW} height={gH + (tipo === 'scorrevole' ? 18 : 8)} rx={1} fill="#dbeafe" stroke={COLONNE} strokeWidth={1.2} />
        </g>
      ))}
      {Array.from({ length: nAnte }).map((_, ia) => {
        const ax = tipo === 'scorrevole' ? ox + ia * antaW - scorrevoleOffset : ox + ia * antaW
        return (
          <g key={ia}>
            <rect x={ax + 1} y={oy + 1} width={antaW - 2} height={gH - 2} fill={tipo === 'scorrevole' ? 'rgba(124,58,237,0.05)' : 'none'} stroke={FRAME} strokeWidth={2.5} />
            {pannello.attivo && <rect x={ax + 3} y={oy + gH - pannH} width={antaW - 6} height={pannH - 2} fill={PANEL} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 2" />}
            {barreV.attivo && Array.from({ length: nBarre }).map((_, ib) => {
              const bx = ax + ((ib + 1) / (nBarre + 1)) * antaW
              return <line key={ib} x1={bx} y1={oy + 3} x2={bx} y2={oy + gH - pannH - 3} stroke={BARRE} strokeWidth={1.5} />
            })}
            {ia > 0 && tipo === 'battente' && <line x1={ax} y1={oy} x2={ax} y2={oy + gH} stroke="#22c55e" strokeWidth={1} strokeDasharray="4 3" />}
            {tipo === 'scorrevole' && <>
              <circle cx={ax + 8} cy={oy + gH + 2} r={4} fill="#ede9fe" stroke={BINARIO} strokeWidth={1} />
              <circle cx={ax + antaW - 8} cy={oy + gH + 2} r={4} fill="#ede9fe" stroke={BINARIO} strokeWidth={1} />
            </>}
          </g>
        )
      })}
      <text x={ox + gW / 2} y={oy + gH + (tipo === 'scorrevole' ? 32 : 26)} textAnchor="middle" fill={DIM} fontSize={9} fontFamily="monospace">{geo.larghezza} cm</text>
      <text x={ox - 14} y={oy + gH / 2} textAnchor="middle" fill={DIM} fontSize={9} fontFamily="monospace" transform={`rotate(-90,${ox - 14},${oy + gH / 2})`}>{geo.altezza} cm</text>
    </svg>
  )
}

/* ── OTT WIDGET ───────────────────────────────────────────────────────────── */
function OttWidget({ nPezzi, pezzo_m, prezzoPerBarra }: { nPezzi: number; pezzo_m: number; prezzoPerBarra: number }) {
  const o = ottimizza(nPezzi, pezzo_m)
  const pct = Math.min(pezzo_m / 6 * 100, 100)
  return (
    <div className="mt-2 p-2.5 rounded-md border bg-muted/30 text-xs space-y-2">
      <div className="relative h-3 rounded-full bg-muted overflow-hidden">
        {Array.from({ length: Math.min(o.pezziPerBarra || 1, 20) }).map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0 rounded-sm"
            style={{ left: `${i * pct}%`, width: `${Math.max(0, pct - 0.5)}%`, background: i % 2 === 0 ? '#3b82f6' : '#60a5fa', opacity: 0.75 }} />
        ))}
        {o.sfridoPerc > 0.5 && (
          <div className="absolute top-0 bottom-0 right-0 bg-orange-400/40" style={{ width: `${o.sfridoPerc}%` }} />
        )}
      </div>
      <div className="flex gap-3 flex-wrap text-muted-foreground">
        <span>Pezzi: <b className="text-foreground">{nPezzi}</b></span>
        <span>Barre 6m: <b className="text-foreground">{o.barre6m}</b></span>
        <span>Sfrido: <b className={o.sfridoM > 0.5 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}>{o.sfridoM.toFixed(2)}m ({o.sfridoPerc.toFixed(0)}%)</b></span>
        <span>Costo: <b className="text-green-600 dark:text-green-400">{fmt(o.barre6m * prezzoPerBarra)}</b></span>
      </div>
    </div>
  )
}

/* ── DB TABLE ─────────────────────────────────────────────────────────────── */
function DbTable({ items, categories, priceLbl = '€/barra (6m)', onAdd, onUpdate, onDelete }: {
  items: DbItem[]; categories: string[]; priceLbl?: string
  onAdd: (i: Omit<DbItem, 'id'>) => Promise<void>
  onUpdate: (i: DbItem) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<DbItem>>({})
  const [newItem, setNewItem] = useState({ label: '', categoria: categories[0], prezzo: 0 })
  const [filt, setFilt] = useState('tutti')
  const cats = ['tutti', ...categories]
  const filtered = filt === 'tutti' ? items : items.filter(i => i.categoria === filt)

  const startEdit = (it: DbItem) => { setEditId(it.id); setDraft({ ...it }) }
  const saveEdit = async () => { if (!draft.label?.trim()) return; await onUpdate(draft as DbItem); setEditId(null) }
  const del = async (id: string) => { if (!window.confirm('Eliminare?')) return; await onDelete(id) }
  const add = async () => {
    if (!String(newItem.label).trim()) return
    await onAdd({ label: newItem.label, categoria: newItem.categoria, prezzo: parseFloat(String(newItem.prezzo)) || 0 })
    setNewItem({ label: '', categoria: categories[0], prezzo: 0 })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap items-center">
        {cats.map(c => (
          <button key={c} onClick={() => setFilt(c)}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              filt === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50 bg-background')}>
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} elem.</span>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrizione</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-36">{priceLbl}</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(it => editId === it.id ? (
              <TableRow key={it.id} className="bg-muted/20">
                <TableCell><Input value={draft.label ?? ''} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} className="h-7 text-sm" /></TableCell>
                <TableCell>
                  <select value={draft.categoria ?? ''} onChange={e => setDraft(d => ({ ...d, categoria: e.target.value }))}
                    className="h-7 text-sm rounded-md border border-input bg-background px-2 w-full">
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </TableCell>
                <TableCell>
                  <Input type="number" value={draft.prezzo ?? 0} step={0.1}
                    onChange={e => setDraft(d => ({ ...d, prezzo: parseFloat(e.target.value) || 0 }))}
                    className="h-7 text-sm font-mono w-24" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={saveEdit}>✓</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}>✕</Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.label}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{it.categoria}</Badge></TableCell>
                <TableCell className="font-mono text-sm">{fmt(it.prezzo)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => del(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-md border p-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aggiungi nuovo</p>
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
          <div><Label className="text-xs mb-1 block">Descrizione</Label>
            <Input value={newItem.label} onChange={e => setNewItem(n => ({ ...n, label: e.target.value }))} placeholder="es. Quadro 16×16" className="h-8 text-sm" /></div>
          <div><Label className="text-xs mb-1 block">Categoria</Label>
            <select value={newItem.categoria} onChange={e => setNewItem(n => ({ ...n, categoria: e.target.value }))}
              className="h-8 text-sm rounded-md border border-input bg-background px-2 w-full">
              {categories.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><Label className="text-xs mb-1 block">Prezzo</Label>
            <Input type="number" value={newItem.prezzo} step={0.1} min={0}
              onChange={e => setNewItem(n => ({ ...n, prezzo: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm font-mono" /></div>
          <Button size="sm" onClick={add} className="h-8"><Plus className="h-3.5 w-3.5 mr-1" />Aggiungi</Button>
        </div>
      </div>
    </div>
  )
}

/* ── DISTINTA HTML ────────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDistinta(p: any): string {
  const { tipo, geo, colonne, telaio, correnti, barreV, pannello, binario, vern, mano, accSel, margine, calc, sezioniPiene, sezioniColonna, binari, accessori, cliente } = p
  const nAnte = tipo === 'cancellata' ? 1 : geo.nAnte
  const antaW_cm = (geo.larghezza / nAnte).toFixed(0)
  const getPP = (id: string) => sezioniPiene.find((s: DbItem) => s.id === id)?.prezzo ?? 0
  const getPC = (id: string) => sezioniColonna.find((s: DbItem) => s.id === id)?.prezzo ?? 0
  const getLabel = (arr: DbItem[], id: string) => arr.find(s => s.id === id)?.label ?? id
  const dataNow = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  const numPrev = 'PREV-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000)
  const tipoLabel = ({ battente: 'Cancello Battente', scorrevole: 'Cancello Scorrevole', cancellata: 'Cancellata' } as Record<string, string>)[tipo] ?? tipo

  const matRows = [
    colonne.attivo && { voce: 'Colonne / Stipiti', desc: getLabel(sezioniColonna, colonne.sezioneId), qta: calc.ottCol.barre6m, um: 'barre 6m', pun: getPC(colonne.sezioneId), tot: calc.costoCol, note: `${colonne.nColonne} colonne · h ${((geo.altezza + colonne.interro) / 100).toFixed(2)}m (inc. ${colonne.interro}cm interro)` },
    tipo !== 'cancellata' && { voce: 'Telaio Ante', desc: getLabel(sezioniPiene, telaio.sezioneId), qta: calc.barre6mTel, um: 'barre 6m', pun: getPP(telaio.sezioneId), tot: calc.costoTelaio, note: `${nAnte} anta${nAnte > 1 ? 'e' : ''} · montanti ${geo.altezza}cm + traversi ${antaW_cm}cm` },
    tipo === 'cancellata' && calc.barre6mCorr > 0 && { voce: 'Correnti Orizzontali', desc: getLabel(sezioniPiene, correnti.sezioneId), qta: calc.barre6mCorr, um: 'barre 6m', pun: getPP(correnti.sezioneId), tot: calc.costoCorr, note: `${correnti.nCorrenti} correnti · luce ${geo.larghezza}cm` },
    tipo === 'scorrevole' && { voce: 'Binario Scorrimento', desc: getLabel(binari, binario.sezioneId), qta: calc.barre6mBinario, um: 'barre 6m', pun: calc.prezzoBinario, tot: calc.costoBinario, note: `Binario ${calc.lunghezzaBinario.toFixed(2)}m = 2 × luce ${geo.larghezza}cm` },
    barreV.attivo && calc.nBarreVert > 0 && { voce: 'Barre Verticali', desc: getLabel(sezioniPiene, barreV.sezioneId), qta: calc.ottBarreV.barre6m, um: 'barre 6m', pun: getPP(barreV.sezioneId), tot: calc.costoBarreV, note: `${calc.nBarreVert}pz × ${(calc.altBarraInt_m * 100).toFixed(0)}cm · interasse ${barreV.interasse}cm` },
    pannello.attivo && { voce: 'Pannellatura / Lamiera', desc: 'Lamiera di riempimento', qta: calc.areaPann, um: 'm²', pun: pannello.prezzom2, tot: calc.costoPann, note: `zona h=${pannello.altezzaZona}cm` },
  ].filter(Boolean) as { voce: string; desc: string; qta?: number; um?: string; pun?: number; tot: number; note?: string }[]

  const lavRows = [
    { voce: 'Verniciatura', desc: `Verniciatura a polvere · sup. ${calc.supTot} m² (coeff.1.4)`, tot: calc.costoVern },
    { voce: 'Manodopera', desc: 'Lavorazione e posa in opera', tot: mano.valore },
  ]
  const accRows = Object.entries(accSel as Record<string, boolean>).filter(([, v]) => v).map(([id]) => {
    const a = (accessori as DbItem[]).find(x => x.id === id)
    return a ? { voce: a.categoria, desc: a.label, qta: 1, um: 'pz', pun: a.prezzo, tot: a.prezzo } : null
  }).filter(Boolean) as { voce: string; desc: string; qta: number; um: string; pun: number; tot: number }[]

  const totMat = matRows.reduce((s, r) => s + r.tot, 0)
  const totLav = lavRows.reduce((s, r) => s + r.tot, 0) + accRows.reduce((s, r) => s + r.tot, 0)

  const rowHtml = (rows: typeof matRows) => rows.map(r => `<tr>
    <td class="bold">${r.voce}</td>
    <td>${r.desc}${'note' in r && r.note ? `<br><span class="note">${r.note}</span>` : ''}</td>
    <td class="right mono">${r.qta !== undefined ? Number(r.qta).toFixed(typeof r.qta === 'number' && r.qta % 1 !== 0 ? 2 : 0) : ''}</td>
    <td>${r.um || ''}</td>
    <td class="right mono">${r.pun !== undefined ? `€ ${Number(r.pun).toFixed(2)}` : ''}</td>
    <td class="right mono bold">€ ${Number(r.tot).toFixed(2)}</td>
  </tr>`).join('')

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Distinta ${numPrev}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1a1a1a;padding:16mm 14mm 12mm}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #e65000}.co{font-size:21pt;font-weight:800;color:#e65000;line-height:1}.co-s{font-size:8.5pt;color:#777;margin-top:3px}.dt{font-size:14pt;font-weight:800;text-align:right}.dn{font-size:9pt;color:#e65000;font-weight:700;text-align:right;margin-top:2px}.dd{font-size:9pt;color:#777;text-align:right;margin-top:2px}.info{display:flex;margin-bottom:16px;border:1.5px solid #e65000;border-radius:7px;overflow:hidden}.ic{flex:1;padding:8px 12px;border-right:1px solid #fbd0be}.ic:last-child{border-right:none}.il{font-size:7.5pt;text-transform:uppercase;letter-spacing:.07em;color:#999;font-weight:700}.iv{font-size:11.5pt;font-weight:700;margin-top:2px}.iv.o{color:#e65000}.sec{font-size:8pt;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:#e65000;margin:14px 0 5px;border-bottom:1px solid #fbd0be;padding-bottom:3px}table{width:100%;border-collapse:collapse}thead tr{background:#f5f5f5}th{padding:5px 7px;text-align:left;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555}th.right,td.right{text-align:right}td{padding:5px 7px;font-size:10pt;border-bottom:1px solid #efefef;vertical-align:top}td.mono{font-family:'Courier New',monospace;font-size:9.5pt}td.bold{font-weight:700}.note{font-size:7.5pt;color:#999;display:block;margin-top:1px}.subtot{margin-top:2px;padding:4px 8px;background:#f9f9f9;display:flex;justify-content:space-between;font-size:10pt;color:#555}.totals{margin-top:16px;border-top:2px solid #e0e0e0;padding-top:10px}.tt{width:300px;margin-left:auto;border-collapse:collapse}.tt td{padding:4px 10px;font-size:10.5pt;border:none}.tc td{background:#f5f5f5;font-weight:600}.tv td{background:#e65000;color:#fff;font-size:14pt;font-weight:800;border-radius:5px;padding:8px 12px}.tu td{color:#2d7a3a;font-size:9pt;font-style:italic}</style></head><body>
<div class="hdr"><div><div class="co">A.L.M. Infissi</div><div class="co-s">Lavorazioni in Ferro · Infissi · Serramenti</div></div><div><div class="dt">Distinta Materiali</div><div class="dn">${numPrev}</div><div class="dd">${dataNow}</div></div></div>
<div class="info"><div class="ic"><div class="il">Cliente</div><div class="iv">${cliente || '—'}</div></div><div class="ic"><div class="il">Tipo</div><div class="iv o">${tipoLabel}</div></div><div class="ic"><div class="il">Dimensioni</div><div class="iv">${geo.larghezza} × ${geo.altezza} cm</div></div>${tipo !== 'cancellata' ? `<div class="ic"><div class="il">Ante</div><div class="iv">${nAnte} (${antaW_cm} cm cad.)</div></div>` : ''}${tipo === 'scorrevole' ? `<div class="ic"><div class="il">Binario</div><div class="iv o">${calc.lunghezzaBinario.toFixed(2)} m</div></div>` : ''}<div class="ic"><div class="il">Tot. barre 6m</div><div class="iv o">${calc.tot6m} pz</div></div></div>
<div class="sec">Materiali Strutturali</div>
<table><thead><tr><th style="width:20%">Voce</th><th>Descrizione</th><th class="right" style="width:6%">Qtà</th><th style="width:7%">U.M.</th><th class="right" style="width:9%">€/u.</th><th class="right" style="width:9%">Totale</th></tr></thead><tbody>${rowHtml(matRows)}</tbody></table>
<div class="subtot"><span>Subtotale materiali</span><span><b>€ ${totMat.toFixed(2)}</b></span></div>
${accRows.length ? `<div class="sec">Accessori & Kit</div><table><thead><tr><th>Categoria</th><th>Descrizione</th><th class="right">Qtà</th><th>U.M.</th><th class="right">€/pz</th><th class="right">Totale</th></tr></thead><tbody>${rowHtml(accRows)}</tbody></table>` : ''}
<div class="sec">Lavorazioni</div>
<table><thead><tr><th style="width:20%">Voce</th><th>Descrizione</th><th class="right" style="width:12%">Totale</th></tr></thead><tbody>${lavRows.map(r => `<tr><td class="bold">${r.voce}</td><td>${r.desc}</td><td class="right mono bold">€ ${r.tot.toFixed(2)}</td></tr>`).join('')}</tbody></table>
<div class="subtot"><span>Subtotale lavorazioni</span><span><b>€ ${totLav.toFixed(2)}</b></span></div>
<div class="totals"><table class="tt"><tr class="tc"><td>Costo totale</td><td class="right mono">€ ${calc.totaleCosto.toFixed(2)}</td></tr><tr><td style="color:#777;font-size:9.5pt">Margine</td><td class="right mono" style="color:#777;font-size:9.5pt">${margine}%</td></tr><tr class="tv"><td>Prezzo di vendita</td><td class="right mono">€ ${calc.totVendita.toFixed(2)}</td></tr><tr class="tu"><td>Utile previsto</td><td class="right mono">€ ${calc.utile.toFixed(2)}</td></tr></table></div>
</body></html>`
}

/* ── MAIN COMPONENT ───────────────────────────────────────────────────────── */
export default function FerroCalcolatore({ mode = 'full' }: { mode?: 'full' | 'calc' | 'db' }) {
  const [sezioniPiene,   setSPRaw]  = useState<DbItem[]>([])
  const [sezioniColonna, setSCRaw]  = useState<DbItem[]>([])
  const [binari,         setBinRaw] = useState<DbItem[]>([])
  const [accessori,      setACRaw]  = useState<DbItem[]>([])
  const [dbReady, setDbReady] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const [tipo,    setTipo]     = useState('battente')
  const [cliente, setCliente]  = useState('')
  const [geo,     setGeo]      = useState({ larghezza: 300, altezza: 200, nAnte: 1 })
  const [colonne, setColonne]  = useState({ attivo: true,  nColonne: 2, sezioneId: '', interro: 60 })
  const [telaio,  setTelaio]   = useState({ sezioneId: '' })
  const [correnti,setCorrenti] = useState({ sezioneId: '', nCorrenti: 3 })
  const [barreV,  setBarreV]   = useState({ attivo: true,  sezioneId: '', interasse: 10 })
  const [pannello,setPannello] = useState({ attivo: false, altezzaZona: 60, prezzom2: 22 })
  const [binario, setBinario]  = useState({ sezioneId: '' })
  const [vern,    setVern]     = useState({ prezzom2: 18 })
  const [mano,    setMano]     = useState({ valore: 200 })
  const [accSel,  setAccSel]   = useState<Record<string, boolean>>({})
  const [margine, setMargine]  = useState(35)

  useEffect(() => {
    const load = async () => {
      const db = createClient()
      const [rSP, rSC, rBin, rAC] = await Promise.all([
        db.from('ferro_sezioni_piene').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
        db.from('ferro_sezioni_colonna').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
        db.from('ferro_binari').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('label'),
        db.from('ferro_accessori').select('id,label,categoria,prezzo,magazzino_prodotto_id').eq('attivo', true).order('categoria').order('label'),
      ])
      if (rSP.error || rSC.error || rBin.error || rAC.error) { toast.error('Errore caricamento dati materiali'); return }
      const sp = (rSP.data ?? []) as DbItem[]
      const sc = (rSC.data ?? []) as DbItem[]
      const bn = (rBin.data ?? []) as DbItem[]
      const ac = (rAC.data ?? []) as DbItem[]
      setSPRaw(sp); setSCRaw(sc); setBinRaw(bn); setACRaw(ac)
      setTelaio({ sezioneId: sp.find(s => s.label === 'Piatta 40×4')?.id ?? sp[0]?.id ?? '' })
      setCorrenti(c => ({ ...c, sezioneId: sp.find(s => s.label === 'Piatta 40×4')?.id ?? sp[0]?.id ?? '' }))
      setBarreV(b => ({ ...b, sezioneId: sp.find(s => s.label === 'Quadro 12×12')?.id ?? sp[0]?.id ?? '' }))
      setColonne(c => ({ ...c, sezioneId: sc.find(s => s.label === 'Tubo Q 60×60×3')?.id ?? sc[0]?.id ?? '' }))
      setBinario({ sezioneId: bn.find(s => s.label === 'Binario 40×40×3')?.id ?? bn[0]?.id ?? '' })
      setDbReady(true)
    }
    load()
  }, [])

  const makeCrud = (table: string, set: React.Dispatch<React.SetStateAction<DbItem[]>>): CrudOps => ({
    onAdd: async (item) => {
      const db = createClient()
      const { data, error } = await db.from(table).insert(item).select().single()
      if (error) { toast.error('Errore nel salvataggio'); return }
      set(prev => [...prev, data as DbItem])
    },
    onUpdate: async (item) => {
      const db = createClient()
      const updateData: Record<string, unknown> = { label: item.label, categoria: item.categoria }
      if (!item.magazzino_prodotto_id) updateData.prezzo = item.prezzo
      const { error } = await db.from(table).update(updateData).eq('id', item.id)
      if (error) { toast.error('Errore aggiornamento'); return }
      set(prev => prev.map(i => i.id === item.id ? item : i))
    },
    onDelete: async (id) => {
      const db = createClient()
      const { error } = await db.from(table).delete().eq('id', id)
      if (error) { toast.error('Errore eliminazione'); return }
      set(prev => prev.filter(i => i.id !== id))
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spCrud  = useMemo<TableCrud>(() => ({ items: sezioniPiene,   ...makeCrud('ferro_sezioni_piene',   setSPRaw)  }), [sezioniPiene])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scCrud  = useMemo<TableCrud>(() => ({ items: sezioniColonna, ...makeCrud('ferro_sezioni_colonna', setSCRaw)  }), [sezioniColonna])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const binCrud = useMemo<TableCrud>(() => ({ items: binari,         ...makeCrud('ferro_binari',          setBinRaw) }), [binari])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const acCrud  = useMemo<TableCrud>(() => ({ items: accessori,      ...makeCrud('ferro_accessori',       setACRaw)  }), [accessori])

  const cambioTipo = (t: string) => {
    setTipo(t)
    if (t === 'scorrevole') { setGeo(g => ({ ...g, nAnte: 1 })); setColonne(c => ({ ...c, attivo: true, nColonne: 2 })) }
    if (t === 'battente')   setGeo(g => ({ ...g, nAnte: 2 }))
    if (t === 'cancellata') setColonne(c => ({ ...c, attivo: false }))
  }

  const getPP  = (id: string) => sezioniPiene.find(s => s.id === id)?.prezzo ?? 0
  const getPC  = (id: string) => sezioniColonna.find(s => s.id === id)?.prezzo ?? 0
  const getBin = (id: string) => binari.find(s => s.id === id)?.prezzo ?? 0

  const calc = useMemo(() => {
    const larg_m = geo.larghezza / 100, alt_m = geo.altezza / 100
    const nAnte = tipo === 'cancellata' ? 1 : geo.nAnte
    const antaW_m = larg_m / nAnte
    const altBarraInt_m = tipo !== 'cancellata' ? Math.max(0.1, alt_m - 0.04) : alt_m

    let ottCol = { barre6m: 0, sfridoM: 0, pezziPerBarra: 0, sfridoPerc: 0 }, costoCol = 0
    if (colonne.attivo) { ottCol = ottimizza(colonne.nColonne, alt_m + colonne.interro / 100); costoCol = ottCol.barre6m * getPC(colonne.sezioneId) }

    let barre6mTel = 0, costoTelaio = 0, barre6mCorr = 0, costoCorr = 0
    if (tipo !== 'cancellata') {
      const oM = ottimizza(2 * nAnte, alt_m), oT = ottimizza(2 * nAnte, antaW_m)
      barre6mTel = oM.barre6m + oT.barre6m; costoTelaio = barre6mTel * getPP(telaio.sezioneId)
    } else {
      barre6mCorr = Math.ceil(larg_m / 6) * correnti.nCorrenti; costoCorr = barre6mCorr * getPP(correnti.sezioneId)
    }

    let lunghezzaBinario = 0, barre6mBinario = 0, costoBinario = 0, prezzoBinario = 0
    if (tipo === 'scorrevole') {
      lunghezzaBinario = larg_m * 2; barre6mBinario = Math.ceil(lunghezzaBinario / 6)
      prezzoBinario = getBin(binario.sezioneId); costoBinario = barre6mBinario * prezzoBinario
    }

    let nBarreVert = 0, ottBarreV = { barre6m: 0, pezziPerBarra: 0, sfridoM: 0, sfridoPerc: 0 }, costoBarreV = 0
    if (barreV.attivo) {
      const inter_m = barreV.interasse / 100
      nBarreVert = tipo !== 'cancellata' ? Math.max(0, Math.ceil(antaW_m / inter_m) - 1) * nAnte : Math.ceil(larg_m / inter_m) + 1
      ottBarreV = ottimizza(nBarreVert, altBarraInt_m); costoBarreV = ottBarreV.barre6m * getPP(barreV.sezioneId)
    }

    let areaPann = 0, costoPann = 0
    if (pannello.attivo) { areaPann = larg_m * (pannello.altezzaZona / 100); costoPann = areaPann * pannello.prezzom2 }

    const supTot = larg_m * alt_m, costoVern = supTot * vern.prezzom2 * 1.4
    const costoAcc = Object.entries(accSel).filter(([, v]) => v).reduce((s, [id]) => s + (accessori.find(a => a.id === id)?.prezzo ?? 0), 0)
    const tot6m = ottCol.barre6m + barre6mTel + barre6mCorr + barre6mBinario + ottBarreV.barre6m
    const totaleCosto = costoCol + costoTelaio + costoCorr + costoBinario + costoBarreV + costoPann + costoVern + costoAcc + mano.valore
    const totVendita = totaleCosto * (1 + margine / 100)
    return { ottCol, costoCol, barre6mTel, costoTelaio, barre6mCorr, costoCorr, lunghezzaBinario, barre6mBinario, costoBinario, prezzoBinario, nBarreVert, ottBarreV, costoBarreV, altBarraInt_m, areaPann: areaPann.toFixed(2), costoPann, supTot: supTot.toFixed(2), costoVern, costoAcc, tot6m, totaleCosto, totVendita, utile: totVendita - totaleCosto }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, tipo, colonne, telaio, correnti, barreV, pannello, binario, vern, accSel, mano, margine, sezioniPiene, sezioniColonna, binari, accessori])

  const nAnte = tipo === 'cancellata' ? 1 : geo.nAnte
  const larg_m = geo.larghezza / 100, alt_m = geo.altezza / 100
  const antaW_m = larg_m / nAnte
  const nColonneLocked = tipo === 'scorrevole'

  const generaDistinta = () => {
    const html = buildDistinta({ tipo, geo, colonne, telaio, correnti, barreV, pannello, binario, vern, mano, accSel, margine, calc, sezioniPiene, sezioniColonna, binari, accessori, cliente })
    const w = window.open('', '_blank')
    if (!w) { alert('Abilita i popup per generare la distinta.'); return }
    w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => w.print(), 600)
  }

  const salvaPreventivo = async () => {
    setSaving(true)
    try {
      const db = createClient()
      const numero = `FERRO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`
      const { error } = await db.from('ferro_preventivi').insert({
        numero, cliente: cliente || null, tipo,
        config: { geo, colonne, telaio, correnti, barreV, pannello, binario, vern, mano, accSel, margine },
        totale_costo: parseFloat(calc.totaleCosto.toFixed(2)),
        totale_vendita: parseFloat(calc.totVendita.toFixed(2)),
        margine, note: null,
      })
      if (error) throw error
      toast.success(`Preventivo ${numero} salvato`)
    } catch { toast.error('Errore nel salvataggio') } finally { setSaving(false) }
  }

  if (!dbReady) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm">Caricamento materiali...</p>
        </div>
      </div>
    )
  }

  const costRows = [
    colonne.attivo && { label: `Colonne (${calc.ottCol.barre6m}× 6m)`, value: calc.costoCol },
    tipo !== 'cancellata' && { label: `Telaio (${calc.barre6mTel}× 6m)`, value: calc.costoTelaio },
    tipo === 'cancellata' && { label: `Correnti (${calc.barre6mCorr}× 6m)`, value: calc.costoCorr },
    tipo === 'scorrevole' && { label: `Binario (${calc.barre6mBinario}× 6m = ${calc.lunghezzaBinario.toFixed(1)}m)`, value: calc.costoBinario, highlight: true },
    barreV.attivo && { label: `Barre vert. (${calc.ottBarreV.barre6m}× 6m)`, value: calc.costoBarreV },
    pannello.attivo && { label: `Pannello (${calc.areaPann} m²)`, value: calc.costoPann },
    { label: 'Verniciatura', value: calc.costoVern },
    { label: 'Manodopera', value: mano.valore },
    calc.costoAcc > 0 && { label: 'Accessori & Kit', value: calc.costoAcc },
  ].filter(Boolean) as { label: string; value: number; highlight?: boolean }[]

  const dbSection = (
    <Tabs defaultValue="piene">
      <TabsList className="mb-4">
        <TabsTrigger value="piene">Barre & Profili ({spCrud.items.length})</TabsTrigger>
        <TabsTrigger value="colonna">Sezioni Colonna ({scCrud.items.length})</TabsTrigger>
        <TabsTrigger value="binari">Binari ({binCrud.items.length})</TabsTrigger>
        <TabsTrigger value="acc">Accessori ({acCrud.items.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="piene"><DbTable items={spCrud.items} categories={CAT_PIENE} onAdd={spCrud.onAdd} onUpdate={spCrud.onUpdate} onDelete={spCrud.onDelete} /></TabsContent>
      <TabsContent value="colonna"><DbTable items={scCrud.items} categories={CAT_COLONNA} onAdd={scCrud.onAdd} onUpdate={scCrud.onUpdate} onDelete={scCrud.onDelete} /></TabsContent>
      <TabsContent value="binari"><DbTable items={binCrud.items} categories={CAT_BINARIO} onAdd={binCrud.onAdd} onUpdate={binCrud.onUpdate} onDelete={binCrud.onDelete} /></TabsContent>
      <TabsContent value="acc"><DbTable items={acCrud.items} categories={CAT_ACC} priceLbl="€/pezzo" onAdd={acCrud.onAdd} onUpdate={acCrud.onUpdate} onDelete={acCrud.onDelete} /></TabsContent>
    </Tabs>
  )

  if (mode === 'db') return dbSection

  const calcSection = (<>
        {/* Tipo selector */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {TIPI.map(t => (
            <Button key={t.id} size="sm"
              variant={tipo === t.id ? 'default' : 'outline'}
              onClick={() => cambioTipo(t.id)}>
              {t.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Cliente:</Label>
            <Input value={cliente} onChange={e => setCliente(e.target.value)}
              placeholder="Nome cliente (per distinta)" className="w-48 h-8 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
          {/* Left column — input sections */}
          <div className="space-y-3">

            {/* Geometria */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">📐 Geometria</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className={cn('grid gap-4', tipo !== 'cancellata' ? 'grid-cols-3' : 'grid-cols-2')}>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Larghezza totale</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={geo.larghezza} min={50} max={2000} step={5}
                        onChange={e => setGeo(g => ({ ...g, larghezza: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                      <span className="text-xs text-muted-foreground">cm</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Altezza</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={geo.altezza} min={50} max={400} step={5}
                        onChange={e => setGeo(g => ({ ...g, altezza: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                      <span className="text-xs text-muted-foreground">cm</span>
                    </div>
                  </div>
                  {tipo !== 'cancellata' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">N° Ante</Label>
                      <div className="flex gap-2">
                        {[1, 2].map(n => (
                          <Button key={n} size="sm" variant={geo.nAnte === n ? 'default' : 'outline'}
                            onClick={() => setGeo(g => ({ ...g, nAnte: n }))} className="h-8 flex-1">
                            {n} {n === 1 ? 'anta' : 'ante'}
                          </Button>
                        ))}
                      </div>
                      {tipo === 'scorrevole' && (
                        <p className="text-xs text-violet-600 dark:text-violet-400">Binario = 2 × {geo.larghezza} cm = <b>{(geo.larghezza / 100 * 2).toFixed(2)} m</b></p>
                      )}
                    </div>
                  )}
                </div>
                <div className="border rounded-md p-2 bg-muted/20">
                  <Preview tipo={tipo} geo={geo} colonne={colonne} barreV={barreV} pannello={pannello} />
                </div>
              </CardContent>
            </Card>

            {/* Binario — solo scorrevole */}
            {tipo === 'scorrevole' && (
              <Card className="border-violet-200 dark:border-violet-800">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm text-violet-700 dark:text-violet-400">⬌ Binario di Scorrimento</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3 text-sm">
                    <div className="flex gap-4 flex-wrap">
                      <span>Lunghezza: <b className="text-violet-700 dark:text-violet-400 font-mono">{calc.lunghezzaBinario.toFixed(2)} m</b></span>
                      <span className="text-muted-foreground">= 2 × {geo.larghezza} cm</span>
                      <span>Barre 6m: <b className="text-violet-700 dark:text-violet-400">{calc.barre6mBinario}</b></span>
                    </div>
                    {calc.lunghezzaBinario <= 6
                      ? <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Una sola barra da 6m sufficiente</p>
                      : <p className="text-xs text-orange-500 mt-1">⚠ Binario oltre 6m — necessario giunto</p>}
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sezione binario</Label>
                    <Select value={binario.sezioneId} onValueChange={v => setBinario({ sezioneId: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{binari.map(s => <SelectItem key={s.id} value={s.id}>{s.label} — {fmt(getBin(s.id))}/barra</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Costo: <b className="text-green-600 dark:text-green-400">{fmt(calc.costoBinario)}</b></p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Colonne */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">🏛️ Colonne / Stipiti</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {nColonneLocked
                  ? <p className="text-sm text-violet-600 dark:text-violet-400">🔒 Cancello scorrevole: sempre 2 colonne</p>
                  : <div className="flex items-center gap-2"><Switch id="col-attivo" checked={colonne.attivo} onCheckedChange={v => setColonne(c => ({ ...c, attivo: v }))} /><Label htmlFor="col-attivo" className="text-sm">Includi colonne nel preventivo</Label></div>}
                {colonne.attivo && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">N° Colonne</Label>
                        {nColonneLocked
                          ? <div className="h-8 flex items-center px-2 rounded-md border bg-muted text-sm font-mono text-violet-600 dark:text-violet-400">2 (fisso)</div>
                          : <div className="flex gap-1">{[2, 3, 4].map(n => <Button key={n} size="sm" variant={colonne.nColonne === n ? 'default' : 'outline'} onClick={() => setColonne(c => ({ ...c, nColonne: n }))} className="h-8 flex-1">{n}</Button>)}</div>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Sezione</Label>
                        <Select value={colonne.sezioneId} onValueChange={v => setColonne(c => ({ ...c, sezioneId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{sezioniColonna.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Interro</Label>
                        <div className="flex items-center gap-1">
                          <Input type="number" value={colonne.interro} min={0} max={200} step={5}
                            onChange={e => setColonne(c => ({ ...c, interro: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                          <span className="text-xs text-muted-foreground">cm</span>
                        </div>
                      </div>
                    </div>
                    <OttWidget nPezzi={colonne.nColonne} pezzo_m={alt_m + colonne.interro / 100} prezzoPerBarra={getPC(colonne.sezioneId)} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Telaio / Correnti */}
            {tipo !== 'cancellata' ? (
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm">🔲 Telaio Ante <span className="text-muted-foreground font-normal text-xs ml-1">{nAnte} anta{nAnte > 1 ? 'e' : ''} · {(antaW_m * 100).toFixed(0)} cm cad.</span></CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Ogni anta: <b className="text-foreground">2 montanti</b> ({geo.altezza} cm) + <b className="text-foreground">2 traversi</b> ({(antaW_m * 100).toFixed(0)} cm)</p>
                  <div className="max-w-xs space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sezione telaio</Label>
                    <Select value={telaio.sezioneId} onValueChange={v => setTelaio({ sezioneId: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{sezioniPiene.map(s => <SelectItem key={s.id} value={s.id}>{s.label} — {fmt(getPP(s.id))}/barra</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Montanti: <b className="text-foreground">{ottimizza(2 * nAnte, alt_m).barre6m} barre</b></span>
                    <span>Traversi: <b className="text-foreground">{ottimizza(2 * nAnte, antaW_m).barre6m} barre</b></span>
                    <span>Costo: <b className="text-green-600 dark:text-green-400">{fmt(calc.costoTelaio)}</b></span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm">➡️ Correnti Orizzontali</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Sezione</Label>
                      <Select value={correnti.sezioneId} onValueChange={v => setCorrenti(c => ({ ...c, sezioneId: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{sezioniPiene.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">N° Correnti</Label>
                      <div className="flex gap-1">{[2, 3, 4, 5].map(n => <Button key={n} size="sm" variant={correnti.nCorrenti === n ? 'default' : 'outline'} onClick={() => setCorrenti(c => ({ ...c, nCorrenti: n }))} className="h-8 flex-1">{n}</Button>)}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Barre 6m: <b className="text-foreground">{calc.barre6mCorr}</b></span>
                    <span>Costo: <b className="text-green-600 dark:text-green-400">{fmt(calc.costoCorr)}</b></span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Barre Verticali */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">⬆️ Barre Verticali — Riempimento</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch id="barrev-attivo" checked={barreV.attivo} onCheckedChange={v => setBarreV(b => ({ ...b, attivo: v }))} />
                  <Label htmlFor="barrev-attivo" className="text-sm">Includi barre verticali di riempimento</Label>
                </div>
                {barreV.attivo && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Sezione</Label>
                        <Select value={barreV.sezioneId} onValueChange={v => setBarreV(b => ({ ...b, sezioneId: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>{sezioniPiene.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Interasse</Label>
                        <div className="flex items-center gap-1">
                          <Input type="number" value={barreV.interasse} min={3} max={30} step={0.5}
                            onChange={e => setBarreV(b => ({ ...b, interasse: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                          <span className="text-xs text-muted-foreground">cm</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Taglio: <b className="text-foreground">{(calc.altBarraInt_m * 100).toFixed(1)} cm</b>{tipo !== 'cancellata' && ' (altezza − 4cm)'}
                      {' '}· Pezzi: <b className="text-foreground">{calc.nBarreVert}</b>
                    </p>
                    <OttWidget nPezzi={calc.nBarreVert} pezzo_m={calc.altBarraInt_m} prezzoPerBarra={getPP(barreV.sezioneId)} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Pannellatura */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">▪️ Pannellatura / Lamiera</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch id="pann-attivo" checked={pannello.attivo} onCheckedChange={v => setPannello(p => ({ ...p, attivo: v }))} />
                  <Label htmlFor="pann-attivo" className="text-sm">Aggiungi pannellatura di riempimento</Label>
                </div>
                {pannello.attivo && (
                  <>
                    {barreV.attivo && <p className="text-xs text-muted-foreground">Zona bassa → pannello · Zona alta → barre verticali</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Altezza zona pannello</Label>
                        <div className="flex items-center gap-1">
                          <Input type="number" value={pannello.altezzaZona} min={10} max={geo.altezza} step={5}
                            onChange={e => setPannello(p => ({ ...p, altezzaZona: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                          <span className="text-xs text-muted-foreground">cm</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Prezzo lamiera</Label>
                        <div className="flex items-center gap-1">
                          <Input type="number" value={pannello.prezzom2} min={5} step={0.5}
                            onChange={e => setPannello(p => ({ ...p, prezzom2: Number(e.target.value) }))} className="h-8 text-sm font-mono" />
                          <span className="text-xs text-muted-foreground">€/m²</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Area: <b className="text-foreground">{calc.areaPann} m²</b></span>
                      <span>Costo: <b className="text-green-600 dark:text-green-400">{fmt(calc.costoPann)}</b></span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Verniciatura & Manodopera */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">🎨 Verniciatura & Manodopera</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Verniciatura a polvere</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" value={vern.prezzom2} min={5} step={0.5}
                        onChange={e => setVern({ prezzom2: Number(e.target.value) })} className="h-8 text-sm font-mono" />
                      <span className="text-xs text-muted-foreground">€/m²</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Sup. {calc.supTot} m² · coeff. 1.4 → <b className="text-green-600 dark:text-green-400">{fmt(calc.costoVern)}</b></p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Manodopera (forfait)</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" value={mano.valore} min={0} step={10}
                        onChange={e => setMano({ valore: Number(e.target.value) })} className="h-8 text-sm font-mono" />
                      <span className="text-xs text-muted-foreground">€</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Accessori */}
            {accessori.length > 0 && (
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm">🔑 {tipo === 'scorrevole' ? 'Accessori & Kit Automatismo' : 'Accessori'}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {tipo === 'scorrevole' && <p className="text-xs text-muted-foreground">Per lo scorrevole seleziona ruote, guida, fermacorsa e kit automatismo se richiesto.</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {accessori.map(a => (
                      <button key={a.id}
                        onClick={() => setAccSel(p => ({ ...p, [a.id]: !p[a.id] }))}
                        className={cn('flex items-center gap-2 p-2 rounded-md border text-left transition-colors',
                          accSel[a.id]
                            ? 'border-primary bg-primary/5 dark:bg-primary/10'
                            : 'border-border bg-background hover:bg-muted/50'
                        )}>
                        <div className={cn('h-4 w-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors',
                          accSel[a.id] ? 'border-primary bg-primary' : 'border-muted-foreground')}>
                          {accSel[a.id] && <span className="text-[9px] text-primary-foreground font-bold">✓</span>}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-tight">{a.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{fmt(a.prezzo)} · {a.categoria}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {calc.costoAcc > 0 && <p className="text-sm text-muted-foreground">Totale accessori: <b className="text-green-600 dark:text-green-400">{fmt(calc.costoAcc)}</b></p>}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column — Riepilogo */}
          <div className="sticky top-4">
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm">📊 Riepilogo Preventivo</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="rounded-md bg-muted/40 p-2.5 text-sm">
                  <span className="text-muted-foreground">{TIPI.find(t => t.id === tipo)?.label} </span>
                  <span className="font-mono font-medium">{geo.larghezza}×{geo.altezza} cm</span>
                  {tipo !== 'cancellata' && <span className="text-muted-foreground"> · {nAnte} anta{nAnte > 1 ? 'e' : ''}</span>}
                  {tipo === 'scorrevole' && <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">Binario: {calc.lunghezzaBinario.toFixed(2)} m</p>}
                  {cliente && <p className="text-xs text-muted-foreground mt-0.5">{cliente}</p>}
                </div>

                <div className="space-y-1">
                  {costRows.map((r, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                      <span className={cn('text-xs', r.highlight ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground')}>{r.label}</span>
                      <span className={cn('text-xs font-mono font-medium', r.highlight ? 'text-violet-600 dark:text-violet-400' : 'text-foreground')}>{fmt(r.value)}</span>
                    </div>
                  ))}
                </div>

                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Costo totale</span>
                  <span className="font-mono font-semibold">{fmt(calc.totaleCosto)}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Margine</Label>
                    <span className="font-mono font-bold text-primary">{margine}%</span>
                  </div>
                  <input type="range" min={5} max={80} value={margine}
                    onChange={e => setMargine(Number(e.target.value))}
                    className="w-full accent-primary h-1.5 rounded-full" />
                </div>

                <div className="rounded-md bg-primary p-3 text-center">
                  <p className="text-xs text-primary-foreground/70 mb-0.5">Prezzo di vendita</p>
                  <p className="font-mono font-bold text-xl text-primary-foreground">{fmt(calc.totVendita)}</p>
                  <p className="text-xs text-primary-foreground/70 mt-0.5">Utile: {fmt(calc.utile)}</p>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  {calc.tot6m} barre da 6m totali
                </p>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={generaDistinta}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Distinta
                  </Button>
                  <Button size="sm" className="flex-1" onClick={salvaPreventivo} disabled={saving}>
                    <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Salvo...' : 'Salva'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </>)

  if (mode === 'calc') return calcSection

  return (
    <Tabs defaultValue="calc" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="calc">Calcolatore</TabsTrigger>
        <TabsTrigger value="db">Database Materiali</TabsTrigger>
      </TabsList>
      <TabsContent value="calc" className="mt-0">{calcSection}</TabsContent>
      <TabsContent value="db" className="mt-0">{dbSection}</TabsContent>
    </Tabs>
  )
}
