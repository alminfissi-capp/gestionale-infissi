'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DialogArticoliFattura from '@/components/contabilita/DialogArticoliFattura'
import { eliminaCosto, salvaContabilita, salvaCostoManuale, type CostoConAvviso, type PaginaContabile as Dati } from '@/actions/contabilita-commessa'
import { costoManodopera, riepilogo, totaliPerCategoria, totaliStima } from '@/lib/contabilita-commessa'
import { parseImporto } from '@/lib/fic/pagamenti'
import { formatData } from '@/lib/fic/formato'
import { formatEuro } from '@/lib/pricing'
import {
  CATEGORIE_COSTO, VOCI_MANODOPERA, type CategoriaCosto, type ContabilitaCommessa, type StimaCommessa, type VoceManodopera,
} from '@/types/contabilita'

const etichetta = Object.fromEntries(CATEGORIE_COSTO.map((c) => [c.value, c.label])) as Record<CategoriaCosto, string>
const perc = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)
const numOrNull = (t: string) => (t.trim() === '' ? null : parseImporto(t))
const testo = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','))

/** Un documento con i suoi articoli (o un costo a mano da solo). */
type Gruppo = { chiave: string; titolo: string; sotto: string; ficId: number | null; costi: CostoConAvviso[]; totale: number }

function raggruppa(costi: CostoConAvviso[]): Gruppo[] {
  const gruppi = new Map<string, Gruppo>()
  for (const c of costi) {
    const chiave = c.origine === 'fattura' ? `f${c.fic_documento_id}` : `m${c.id}`
    const g = gruppi.get(chiave) ?? {
      chiave,
      titolo: c.origine === 'fattura' ? (c.fornitore_nome ?? 'Fornitore') : c.descrizione,
      sotto: c.origine === 'fattura'
        ? `${c.tipo_documento === 'nota_credito' ? 'NC ' : ''}${c.numero_documento ?? ''}${c.data_documento ? ` · ${formatData(c.data_documento)}` : ''}`
        : `manuale · ${etichetta[c.categoria]}${c.data_documento ? ` · ${formatData(c.data_documento)}` : ''}`,
      ficId: c.fic_documento_id,
      costi: [],
      totale: 0,
    }
    g.costi.push(c)
    g.totale = Math.round((g.totale + c.importo) * 100) / 100
    gruppi.set(chiave, g)
  }
  return [...gruppi.values()]
}

export default function PaginaContabile({ dati }: { dati: Dati }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cont, setCont] = useState<ContabilitaCommessa>(() => ({
    ...dati.contabilita,
    stima: dati.contabilita.stima ?? dati.stimaPreventivo,
  }))
  const [modificato, setModificato] = useState(false)
  const [dialogFattura, setDialogFattura] = useState<{ ficId: number | null } | null>(null)
  const [dialogManuale, setDialogManuale] = useState<CostoConAvviso | 'nuovo' | null>(null)
  const [aperti, setAperti] = useState<Set<string>>(new Set())

  const tariffa = cont.tariffa_giornaliera ?? dati.impostazioni.tariffa
  const percFissi = cont.perc_costi_fissi ?? dati.impostazioni.percFissi
  const materiali = totaliPerCategoria(dati.costi)
  const manodopera = costoManodopera(cont.manodopera, tariffa)
  const reale = riepilogo({
    totaleLavoro: dati.commessa.totale_lavoro, materiali: materiali.totale, manodopera: manodopera.totale,
    percFissi, imprevisti: materiali.perCategoria.altro,
  })
  const ts = totaliStima(cont.stima)
  const stimato = riepilogo({
    totaleLavoro: dati.commessa.totale_lavoro, materiali: ts.materiali, manodopera: ts.manodopera,
    percFissi, imprevisti: cont.stima?.altro ?? 0,
  })
  const gruppi = raggruppa(dati.costi)
  const puo = dati.puoModificare

  function aggiorna(f: (c: ContabilitaCommessa) => ContabilitaCommessa) {
    setCont(f)
    setModificato(true)
  }
  function setManodopera(v: VoceManodopera, campo: 'persone' | 'giorni', t: string) {
    aggiorna((c) => ({ ...c, manodopera: { ...c.manodopera, [v]: { ...c.manodopera[v], [campo]: numOrNull(t) } } }))
  }
  function setStima(chiave: keyof StimaCommessa, t: string) {
    aggiorna((c) => {
      const s: StimaCommessa = { ...(c.stima ?? {}) }
      const n = numOrNull(t)
      if (n === null) delete s[chiave]
      else s[chiave] = n
      return { ...c, stima: s }
    })
  }

  function salva() {
    startTransition(async () => {
      try {
        const r = await salvaContabilita(dati.commessa.id, cont)
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Contabilità salvata')
        setModificato(false)
        router.refresh()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function elimina(c: CostoConAvviso) {
    if (!confirm(`Togliere "${c.descrizione}" dai costi della commessa?`)) return
    startTransition(async () => {
      try {
        const r = await eliminaCosto(c.id)
        if (!r.ok) toast.error(r.errore)
        else router.refresh()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  const riquadro = (titolo: string, valore: string, sotto?: string, colore = '') => (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{titolo}</div>
      <div className={`text-lg font-semibold ${colore}`}>{valore}</div>
      {sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── Testata ── */}
      <div>
        <h1 className="text-2xl font-bold">Contabilità · {dati.commessa.numero_commessa || 'Commessa'}</h1>
        <p className="text-sm text-muted-foreground">
          {dati.commessa.cliente_nome}
          {dati.commessa.preventivo_numero ? ` · preventivo ${dati.commessa.preventivo_numero}` : ''}
          {' · '}Totale lavoro (IVA esclusa) <strong className="text-foreground">€ {formatEuro(dati.commessa.totale_lavoro)}</strong>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {riquadro('Totale costi', `€ ${formatEuro(reale.totaleCosti)}`)}
        {riquadro('Utile reale', `€ ${formatEuro(reale.utile)}`, `ricarico ${perc(reale.ricarico)} · margine ${perc(reale.margine)}`, reale.utile < 0 ? 'text-destructive' : 'text-emerald-700')}
        {riquadro('Utile stimato', `€ ${formatEuro(stimato.utile)}`, `ricarico ${perc(stimato.ricarico)} · margine ${perc(stimato.margine)}`)}
        {riquadro('Differenza', `€ ${formatEuro(Math.round((reale.utile - stimato.utile) * 100) / 100)}`, 'reale − stimato', reale.utile < stimato.utile ? 'text-destructive' : 'text-emerald-700')}
      </div>

      {/* ── Materiali e spese ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Materiali e spese</h2>
          <span className="text-sm text-muted-foreground">€ {formatEuro(materiali.totale)}</span>
          {puo && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => setDialogFattura({ ficId: null })}><Plus className="h-4 w-4" /> Aggiungi da fattura</Button>
              <Button size="sm" variant="outline" onClick={() => setDialogManuale('nuovo')}><Plus className="h-4 w-4" /> Costo a mano</Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORIE_COSTO.map((c) => (
            <div key={c.value} className="rounded-md border p-2 text-sm">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="font-medium">€ {formatEuro(materiali.perCategoria[c.value])}</div>
            </div>
          ))}
        </div>
        <div className="rounded-md border">
          {gruppi.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nessun costo ancora: aggiungi le fatture d&apos;acquisto o i costi a mano.</p>
          ) : gruppi.map((g) => {
            const aperto = aperti.has(g.chiave)
            const conAvviso = g.costi.some((c) => c.avviso)
            const manuale = g.ficId === null
            return (
              <div key={g.chiave} className="border-b last:border-b-0">
                {/* Azzurro chiaro sulle fatture: si contano a colpo d'occhio; i costi a mano restano bianchi. */}
                <div className={`flex flex-wrap items-center gap-2 p-2 text-sm ${manuale ? '' : 'bg-sky-50 dark:bg-sky-950/40'}`}>
                  {!manuale ? (
                    <button type="button" className="flex items-center gap-1" onClick={() => setAperti((s) => {
                      const n = new Set(s); if (n.has(g.chiave)) n.delete(g.chiave); else n.add(g.chiave); return n
                    })}>
                      {aperto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-medium">{g.titolo}</span>
                    </button>
                  ) : <span className="font-medium">{g.titolo}</span>}
                  <span className="text-muted-foreground">{g.sotto}</span>
                  {manuale && <Badge variant="outline">manuale</Badge>}
                  {conAvviso && <span title="Fattura cambiata su FiC"><AlertTriangle className="h-4 w-4 text-amber-600" /></span>}
                  <span className="ml-auto font-medium">€ {formatEuro(g.totale)}</span>
                  {puo && !manuale && (
                    <Button size="sm" variant="ghost" onClick={() => setDialogFattura({ ficId: g.ficId })} title="Modifica articoli"><Pencil className="h-4 w-4" /></Button>
                  )}
                  {puo && manuale && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setDialogManuale(g.costi[0])} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => elimina(g.costi[0])} title="Elimina"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
                {aperto && !manuale && (
                  <div className="overflow-x-auto px-2 pb-2">
                    <table className="w-full text-sm">
                      <tbody>
                        {g.costi.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="p-1">
                              {c.descrizione}
                              {c.codice && <span className="ml-1 text-xs text-muted-foreground">{c.codice}</span>}
                              {c.avviso && <div className="text-xs text-amber-700">{c.avviso}</div>}
                            </td>
                            <td className="p-1 text-right whitespace-nowrap">{testo(c.quantita)} {c.unita ?? ''}</td>
                            <td className="p-1 text-right whitespace-nowrap">€ {formatEuro(c.prezzo_unitario ?? 0)}</td>
                            <td className="p-1 text-right whitespace-nowrap font-medium">€ {formatEuro(c.importo)}</td>
                            <td className="p-1 text-muted-foreground">{etichetta[c.categoria]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Manodopera ── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Manodopera</h2>
          <span className="text-sm text-muted-foreground">€ {formatEuro(manodopera.totale)}</span>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Label htmlFor="cc-tariffa">Tariffa al giorno per persona €</Label>
            <Input id="cc-tariffa" className="w-24 text-right" inputMode="decimal" disabled={!puo}
              placeholder={testo(dati.impostazioni.tariffa)} defaultValue={testo(cont.tariffa_giornaliera)}
              onChange={(e) => aggiorna((c) => ({ ...c, tariffa_giornaliera: numOrNull(e.target.value) }))} />
          </div>
        </div>
        <div className="space-y-2">
          {VOCI_MANODOPERA.map((v) => (
            <div key={v.value} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
              <span className="w-24 font-medium">{v.label}</span>
              <Label className="text-xs">Persone</Label>
              <Input key={`p-${v.value}-${testo(cont.manodopera[v.value].persone)}`} className="w-20 text-right" inputMode="decimal" disabled={!puo}
                defaultValue={testo(cont.manodopera[v.value].persone)} onBlur={(e) => setManodopera(v.value, 'persone', e.target.value)} />
              <Label className="text-xs">Giorni</Label>
              <Input key={`g-${v.value}-${testo(cont.manodopera[v.value].giorni)}`} className="w-20 text-right" inputMode="decimal" disabled={!puo}
                defaultValue={testo(cont.manodopera[v.value].giorni)} onBlur={(e) => setManodopera(v.value, 'giorni', e.target.value)} />
              <span className="text-muted-foreground">
                Cronometro: {testo(dati.cronometro[v.value])} gg
              </span>
              {puo && dati.cronometro[v.value] > 0 && (
                <Button size="sm" variant="outline" onClick={() => aggiorna((c) => ({
                  ...c,
                  manodopera: {
                    ...c.manodopera,
                    [v.value]: { persone: c.manodopera[v.value].persone ?? 1, giorni: dati.cronometro[v.value] },
                  },
                }))}>Usa</Button>
              )}
              <span className="ml-auto font-medium">€ {formatEuro(manodopera[v.value])}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Costi fissi ── */}
      <section className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
        <h2 className="text-lg font-semibold">Costi fissi</h2>
        <Input className="w-20 text-right" inputMode="decimal" disabled={!puo}
          placeholder={testo(dati.impostazioni.percFissi)} defaultValue={testo(cont.perc_costi_fissi)}
          onChange={(e) => aggiorna((c) => ({ ...c, perc_costi_fissi: numOrNull(e.target.value) }))} />
        <span>% di materiali e spese + manodopera</span>
        <span className="ml-auto font-medium">€ {formatEuro(reale.costiFissi)}</span>
      </section>

      {/* ── Stima ── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Stima</h2>
          <span className="text-sm text-muted-foreground">
            {dati.stimaPreventivo ? 'Partita dal preventivo, correggibile' : 'Da compilare a mano'}
          </span>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="p-2">Voce</th><th className="p-2 text-right">Stimato</th><th className="p-2 text-right">Reale</th><th className="p-2 text-right">Scostamento</th></tr>
            </thead>
            <tbody>
              {([
                ...(cont.stima?.materiali_preventivo !== undefined || dati.stimaPreventivo
                  ? [{ chiave: 'materiali_preventivo' as const, label: 'Materiali (da preventivo, non divisi)', reale: null as number | null }]
                  : []),
                ...CATEGORIE_COSTO.map((c) => ({ chiave: c.value as keyof StimaCommessa, label: c.label, reale: materiali.perCategoria[c.value] as number | null })),
                { chiave: 'manodopera' as const, label: 'Manodopera', reale: manodopera.totale },
              ]).map((r) => {
                const stimaVal = cont.stima?.[r.chiave]
                return (
                  <tr key={r.chiave} className="border-t">
                    <td className="p-2">{r.label}</td>
                    <td className="p-2 text-right">
                      <Input className="ml-auto w-28 text-right" inputMode="decimal" disabled={!puo}
                        defaultValue={testo(stimaVal)} onChange={(e) => setStima(r.chiave, e.target.value)} />
                    </td>
                    <td className="p-2 text-right">{r.reale === null ? '' : `€ ${formatEuro(r.reale)}`}</td>
                    <td className="p-2 text-right">
                      {r.reale !== null && stimaVal !== undefined ? `€ ${formatEuro(Math.round((r.reale - stimaVal) * 100) / 100)}` : ''}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t font-medium">
                <td className="p-2">Costi fissi</td>
                <td className="p-2 text-right">€ {formatEuro(stimato.costiFissi)}</td>
                <td className="p-2 text-right">€ {formatEuro(reale.costiFissi)}</td>
                <td className="p-2 text-right">€ {formatEuro(Math.round((reale.costiFissi - stimato.costiFissi) * 100) / 100)}</td>
              </tr>
              <tr className="border-t font-semibold">
                <td className="p-2">Totale costi</td>
                <td className="p-2 text-right">€ {formatEuro(stimato.totaleCosti)}</td>
                <td className="p-2 text-right">€ {formatEuro(reale.totaleCosti)}</td>
                <td className="p-2 text-right">€ {formatEuro(Math.round((reale.totaleCosti - stimato.totaleCosti) * 100) / 100)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {puo && (
        <div className="sticky bottom-2 flex justify-end">
          <Button onClick={salva} disabled={pending || !modificato} className="shadow-lg">
            {pending ? 'Salvataggio…' : modificato ? 'Salva manodopera, costi fissi e stima' : 'Tutto salvato'}
          </Button>
        </div>
      )}

      {dialogFattura && (
        <DialogArticoliFattura
          commessaId={dati.commessa.id}
          dataConferma={dati.commessa.data_conferma}
          ficIdIniziale={dialogFattura.ficId}
          onClose={() => setDialogFattura(null)}
        />
      )}
      {dialogManuale && (
        <DialogCostoManuale
          commessaId={dati.commessa.id}
          costo={dialogManuale === 'nuovo' ? null : dialogManuale}
          onClose={() => setDialogManuale(null)}
        />
      )}
    </div>
  )
}

function DialogCostoManuale({ commessaId, costo, onClose }: { commessaId: string; costo: CostoConAvviso | null; onClose: () => void }) {
  const router = useRouter()
  const [descrizione, setDescrizione] = useState(costo?.descrizione ?? '')
  const [categoria, setCategoria] = useState<CategoriaCosto>(costo?.categoria ?? 'altro')
  const [importo, setImporto] = useState(costo ? testo(costo.importo) : '')
  const [data, setData] = useState(costo?.data_documento ?? '')
  const [pending, startTransition] = useTransition()

  function salva() {
    const n = parseImporto(importo)
    if (n === null) { toast.error('Importo non valido'); return }
    startTransition(async () => {
      try {
        const r = await salvaCostoManuale({ id: costo?.id, commessaId, descrizione, categoria, importo: n, data: data || null })
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Costo salvato')
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{costo ? 'Modifica costo' : 'Costo a mano'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cm-descr">Descrizione</Label>
            <Input id="cm-descr" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Es. gasolio furgone, noleggio piattaforma" />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaCosto)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIE_COSTO.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label htmlFor="cm-importo">Importo € (IVA esclusa)</Label>
              <Input id="cm-importo" className="w-36 text-right" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cm-data">Data</Label>
              <Input id="cm-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Annulla</Button>
            <Button onClick={salva} disabled={pending}>{pending ? 'Salvataggio…' : 'Salva'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
