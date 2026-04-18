'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { upsertProfili, upsertAccessori, upsertColori, upsertRiempimenti } from '@/actions/winconfig'
import type {
  WcSerieCompleta, WcProfilo, WcAccessorio, WcColore, WcRiempimento,
  TipoProfilo, UnitaAccessorio, TipoSovrapprezzo, TipoRiempimento,
  RegolaQty, WcProfiloInput, WcAccessorioInput, WcColoreInput, WcRiempimentoInput,
} from '@/types/winconfig'
import { formatEuro } from '@/lib/pricing'

type Props = { serie: WcSerieCompleta }

// ---- PROFILI ----
function TabProfili({ serie }: { serie: WcSerieCompleta }) {
  type Riga = WcProfiloInput & { _key: number }
  const [righe, setRighe] = useState<Riga[]>(
    serie.profili.map((p, i) => ({ ...p, _key: i }))
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  let nextKey = righe.length

  const aggiungi = () => setRighe(r => [
    ...r,
    { _key: nextKey++, codice: '', nome: '', tipo: 'altro', peso_ml: 0, prezzo_ml: 0, prezzo_acquisto_ml: 0, ordine: r.length },
  ])
  const rimuovi = (k: number) => setRighe(r => r.filter(x => x._key !== k))
  const aggiorna = <K extends keyof Riga>(k: number, field: K, val: Riga[K]) =>
    setRighe(r => r.map(x => x._key === k ? { ...x, [field]: val } : x))

  const salva = () => startTransition(async () => {
    try {
      await upsertProfili(serie.id, righe.map(({ _key: _, ...r }) => r))
      toast.success('Profili salvati')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const TIPI: TipoProfilo[] = ['telaio','anta','traversa','montante','fermavetro','coprifilo','altro']

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          Definisci i profili della serie. Almeno un profilo <Badge variant="secondary">telaio</Badge> e uno <Badge variant="secondary">anta</Badge> per il calcolo automatico.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={aggiungi}><Plus className="w-4 h-4 mr-1" />Aggiungi</Button>
          <Button size="sm" onClick={salva} disabled={pending}><Save className="w-4 h-4 mr-1" />{pending ? 'Salvo...' : 'Salva'}</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="text-left px-2 py-2 font-medium">Codice</th>
              <th className="text-left px-2 py-2 font-medium w-48">Nome</th>
              <th className="text-left px-2 py-2 font-medium">Tipo</th>
              <th className="text-right px-2 py-2 font-medium">kg/ml</th>
              <th className="text-right px-2 py-2 font-medium">€/ml</th>
              <th className="text-right px-2 py-2 font-medium">Acq €/ml</th>
              <th className="text-right px-2 py-2 font-medium">Ord.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {righe.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-slate-400 text-xs italic">Nessun profilo. Clicca "Aggiungi".</td></tr>
            )}
            {righe.map(r => (
              <tr key={r._key} className="border-t border-slate-100">
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-24" value={r.codice}
                    onChange={e => aggiorna(r._key, 'codice', e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs" value={r.nome}
                    onChange={e => aggiorna(r._key, 'nome', e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <Select value={r.tipo} onValueChange={v => aggiorna(r._key, 'tipo', v as TipoProfilo)}>
                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPI.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.peso_ml}
                    onChange={e => aggiorna(r._key, 'peso_ml', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.prezzo_ml}
                    onChange={e => aggiorna(r._key, 'prezzo_ml', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.prezzo_acquisto_ml}
                    onChange={e => aggiorna(r._key, 'prezzo_acquisto_ml', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-14 text-right" type="number" value={r.ordine}
                    onChange={e => aggiorna(r._key, 'ordine', parseInt(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                    onClick={() => rimuovi(r._key)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- ACCESSORI ----
function TabAccessori({ serie }: { serie: WcSerieCompleta }) {
  type Riga = WcAccessorioInput & { _key: number }
  const [righe, setRighe] = useState<Riga[]>(
    serie.accessori.map((a, i) => ({ ...a, _key: i }))
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  let nextKey = righe.length

  const aggiungi = () => setRighe(r => [
    ...r,
    { _key: nextKey++, codice: '', nome: '', unita: 'pz', prezzo: 0, prezzo_acquisto: 0, regole_qty: [], qty_fissa: 1, ordine: r.length },
  ])
  const rimuovi = (k: number) => setRighe(r => r.filter(x => x._key !== k))
  const aggiorna = <K extends keyof Riga>(k: number, field: K, val: Riga[K]) =>
    setRighe(r => r.map(x => x._key === k ? { ...x, [field]: val } : x))

  const salva = () => startTransition(async () => {
    try {
      await upsertAccessori(serie.id, righe.map(({ _key: _, ...r }) => r))
      toast.success('Accessori salvati')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const UNITA: UnitaAccessorio[] = ['pz','ml','coppia']

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          La quantità viene determinata dalla prima regola range che si applica (L ≤ larghezza_max E H_media ≤ altezza_max),
          altrimenti da <em>qty fissa</em>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={aggiungi}><Plus className="w-4 h-4 mr-1" />Aggiungi</Button>
          <Button size="sm" onClick={salva} disabled={pending}><Save className="w-4 h-4 mr-1" />{pending ? 'Salvo...' : 'Salva'}</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs">
              <th className="text-left px-2 py-2 font-medium">Codice</th>
              <th className="text-left px-2 py-2 font-medium w-40">Nome</th>
              <th className="text-right px-2 py-2 font-medium">Um</th>
              <th className="text-right px-2 py-2 font-medium">€/um</th>
              <th className="text-right px-2 py-2 font-medium">Acq €</th>
              <th className="text-right px-2 py-2 font-medium">Qty fissa</th>
              <th className="text-left px-2 py-2 font-medium">Regole range (JSON)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {righe.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-slate-400 text-xs italic">Nessun accessorio.</td></tr>
            )}
            {righe.map(r => (
              <tr key={r._key} className="border-t border-slate-100">
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-24" value={r.codice}
                    onChange={e => aggiorna(r._key, 'codice', e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs" value={r.nome}
                    onChange={e => aggiorna(r._key, 'nome', e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <Select value={r.unita} onValueChange={v => aggiorna(r._key, 'unita', v as UnitaAccessorio)}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITA.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.prezzo}
                    onChange={e => aggiorna(r._key, 'prezzo', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.prezzo_acquisto}
                    onChange={e => aggiorna(r._key, 'prezzo_acquisto', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-1 py-1">
                  <Input className="h-7 text-xs w-20 text-right" type="number" step="0.5"
                    value={r.qty_fissa ?? ''} placeholder="auto"
                    onChange={e => aggiorna(r._key, 'qty_fissa', e.target.value === '' ? null : parseFloat(e.target.value))} />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-xs font-mono"
                    value={JSON.stringify(r.regole_qty)}
                    placeholder='[{"larghezza_max":1500,"altezza_max":2400,"qty":2}]'
                    onChange={e => {
                      try { aggiorna(r._key, 'regole_qty', JSON.parse(e.target.value)) } catch {}
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                    onClick={() => rimuovi(r._key)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- COLORI ----
function TabColori({ serie }: { serie: WcSerieCompleta }) {
  type Riga = WcColoreInput & { _key: number }
  const [righe, setRighe] = useState<Riga[]>(
    serie.colori.map((c, i) => ({ ...c, _key: i }))
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  let nextKey = righe.length

  const aggiungi = () => setRighe(r => [
    ...r,
    { _key: nextKey++, nome: '', codice_ral: '', tipo_sovrapprezzo: 'percentuale', valore_sovrapprezzo: 0, bicolore_disponibile: false, ordine: r.length },
  ])
  const rimuovi = (k: number) => setRighe(r => r.filter(x => x._key !== k))
  const aggiorna = <K extends keyof Riga>(k: number, field: K, val: Riga[K]) =>
    setRighe(r => r.map(x => x._key === k ? { ...x, [field]: val } : x))

  const salva = () => startTransition(async () => {
    try {
      await upsertColori(serie.id, righe.map(({ _key: _, ...r }) => r))
      toast.success('Colori salvati')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const TIPI_SP: TipoSovrapprezzo[] = ['percentuale','mq','fisso']

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={aggiungi}><Plus className="w-4 h-4 mr-1" />Aggiungi</Button>
        <Button size="sm" onClick={salva} disabled={pending}><Save className="w-4 h-4 mr-1" />{pending ? 'Salvo...' : 'Salva'}</Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs">
            <th className="text-left px-2 py-2 font-medium w-40">Nome colore</th>
            <th className="text-left px-2 py-2 font-medium">RAL</th>
            <th className="text-left px-2 py-2 font-medium">Tipo sovrapprezzo</th>
            <th className="text-right px-2 py-2 font-medium">Valore</th>
            <th className="text-center px-2 py-2 font-medium">Bicolore</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {righe.length === 0 && (
            <tr><td colSpan={6} className="text-center py-6 text-slate-400 text-xs italic">Nessun colore.</td></tr>
          )}
          {righe.map(r => (
            <tr key={r._key} className="border-t border-slate-100">
              <td className="px-1 py-1">
                <Input className="h-7 text-xs" value={r.nome}
                  onChange={e => aggiorna(r._key, 'nome', e.target.value)} />
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-24" value={r.codice_ral ?? ''}
                  placeholder="es. 9010"
                  onChange={e => aggiorna(r._key, 'codice_ral', e.target.value || null)} />
              </td>
              <td className="px-1 py-1">
                <Select value={r.tipo_sovrapprezzo} onValueChange={v => aggiorna(r._key, 'tipo_sovrapprezzo', v as TipoSovrapprezzo)}>
                  <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI_SP.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-24 text-right" type="number" step="0.01" value={r.valore_sovrapprezzo}
                  onChange={e => aggiorna(r._key, 'valore_sovrapprezzo', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="px-1 py-1 text-center">
                <input type="checkbox" checked={r.bicolore_disponibile}
                  onChange={e => aggiorna(r._key, 'bicolore_disponibile', e.target.checked)} />
              </td>
              <td className="px-1 py-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                  onClick={() => rimuovi(r._key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- RIEMPIMENTI ----
function TabRiempimenti({ serie }: { serie: WcSerieCompleta }) {
  type Riga = WcRiempimentoInput & { _key: number }
  const [righe, setRighe] = useState<Riga[]>(
    serie.riempimenti.map((r, i) => ({ ...r, _key: i }))
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  let nextKey = righe.length

  const aggiungi = () => setRighe(r => [
    ...r,
    { _key: nextKey++, serie_id: serie.id, nome: '', tipo: 'vetro', spessore_mm: null, prezzo_mq: 0, prezzo_acquisto_mq: 0, mq_minimo: 0, ordine: r.length },
  ])
  const rimuovi = (k: number) => setRighe(r => r.filter(x => x._key !== k))
  const aggiorna = <K extends keyof Riga>(k: number, field: K, val: Riga[K]) =>
    setRighe(r => r.map(x => x._key === k ? { ...x, [field]: val } : x))

  const salva = () => startTransition(async () => {
    try {
      await upsertRiempimenti(serie.id, righe.map(({ _key: _, ...r }) => r))
      toast.success('Riempimenti salvati')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const TIPI_R: TipoRiempimento[] = ['vetro','pannello','persiana','altro']

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={aggiungi}><Plus className="w-4 h-4 mr-1" />Aggiungi</Button>
        <Button size="sm" onClick={salva} disabled={pending}><Save className="w-4 h-4 mr-1" />{pending ? 'Salvo...' : 'Salva'}</Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs">
            <th className="text-left px-2 py-2 font-medium w-48">Nome</th>
            <th className="text-left px-2 py-2 font-medium">Tipo</th>
            <th className="text-right px-2 py-2 font-medium">Spessore mm</th>
            <th className="text-right px-2 py-2 font-medium">€/m²</th>
            <th className="text-right px-2 py-2 font-medium">Acq €/m²</th>
            <th className="text-right px-2 py-2 font-medium">MQ min.</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {righe.length === 0 && (
            <tr><td colSpan={7} className="text-center py-6 text-slate-400 text-xs italic">Nessun riempimento.</td></tr>
          )}
          {righe.map(r => (
            <tr key={r._key} className="border-t border-slate-100">
              <td className="px-1 py-1">
                <Input className="h-7 text-xs" value={r.nome}
                  onChange={e => aggiorna(r._key, 'nome', e.target.value)} />
              </td>
              <td className="px-1 py-1">
                <Select value={r.tipo} onValueChange={v => aggiorna(r._key, 'tipo', v as TipoRiempimento)}>
                  <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI_R.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-24 text-right" type="number"
                  value={r.spessore_mm ?? ''} placeholder="—"
                  onChange={e => aggiorna(r._key, 'spessore_mm', e.target.value === '' ? null : parseInt(e.target.value))} />
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-24 text-right" type="number" step="0.01" value={r.prezzo_mq}
                  onChange={e => aggiorna(r._key, 'prezzo_mq', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-24 text-right" type="number" step="0.01" value={r.prezzo_acquisto_mq}
                  onChange={e => aggiorna(r._key, 'prezzo_acquisto_mq', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="px-1 py-1">
                <Input className="h-7 text-xs w-20 text-right" type="number" step="0.01" value={r.mq_minimo}
                  onChange={e => aggiorna(r._key, 'mq_minimo', parseFloat(e.target.value) || 0)} />
              </td>
              <td className="px-1 py-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                  onClick={() => rimuovi(r._key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- MAIN ----
export default function SerieDetailClient({ serie }: Props) {
  return (
    <Tabs defaultValue="profili">
      <TabsList>
        <TabsTrigger value="profili">Profili/Barre ({serie.profili.length})</TabsTrigger>
        <TabsTrigger value="accessori">Accessori ({serie.accessori.length})</TabsTrigger>
        <TabsTrigger value="colori">Colori ({serie.colori.length})</TabsTrigger>
        <TabsTrigger value="riempimenti">Riempimenti ({serie.riempimenti.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="profili" className="mt-4"><TabProfili serie={serie} /></TabsContent>
      <TabsContent value="accessori" className="mt-4"><TabAccessori serie={serie} /></TabsContent>
      <TabsContent value="colori" className="mt-4"><TabColori serie={serie} /></TabsContent>
      <TabsContent value="riempimenti" className="mt-4"><TabRiempimenti serie={serie} /></TabsContent>
    </Tabs>
  )
}
