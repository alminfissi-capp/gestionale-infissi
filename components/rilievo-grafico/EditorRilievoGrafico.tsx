'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Loader2, PenLine, Redo2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import PulsanteIndietro from '@/components/layout/PulsanteIndietro'
import { db } from '@/lib/db'
import type { DisegnoGrafico, Forma, RilievoGrafico, Zona } from '@/types/rilievo-grafico'
import { calcolaDisegno, nomeRuolo } from '@/lib/rilievo-grafico/geometria'
import { interpretaTraccia } from '@/lib/rilievo-grafico/traccia'
import { dividi } from '@/lib/rilievo-grafico/modifiche'
import { mancanti, potaAssegnazioni } from '@/lib/rilievo-grafico/ruoli'
import DisegnoSvg from './DisegnoSvg'
import PannelloForma from './PannelloForma'
import PannelloStruttura, { type SelezioneStruttura } from './PannelloStruttura'
import PannelloProfili from './PannelloProfili'
import { aggiornaDalServer, salvaRilievo } from './archivio'

/** Carica il rilievo dal dispositivo (e, se manca, dal server) e apre l'editor */
export default function CaricaRilievoGrafico({ id }: { id: string }) {
  const [cercatoSulServer, setCercatoSulServer] = useState(false)
  const r = useLiveQuery(() => db.rilieviGrafici.get(id).then(x => x ?? null), [id])
  useEffect(() => {
    let vivo = true
    void aggiornaDalServer().finally(() => { if (vivo) setCercatoSulServer(true) })
    return () => { vivo = false }
  }, [id])
  if (r === undefined || (r === null && !cercatoSulServer)) {
    return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Caricamento…</p>
  }
  if (r === null) {
    return (
      <div className="space-y-3 p-6">
        <PulsanteIndietro fallback="/rilievo/grafico" />
        <p className="text-sm">Rilievo non trovato (eliminato, oppure mai inviato dal dispositivo su cui è stato fatto).</p>
      </div>
    )
  }
  const { daInviare: _d, ...rilievo } = r
  return <Editor key={id} iniziale={rilievo} />
}

/** Salva togliendo le assegnazioni di pezzi che non esistono piu' */
async function salvaOra(x: RilievoGrafico) {
  const pulite = potaAssegnazioni(calcolaDisegno(x.disegno), x.disegno.profili, x.disegno.riempimenti)
  await salvaRilievo({ ...x, disegno: { ...x.disegno, ...pulite } })
}

type Scheda = 'struttura' | 'profili'
type Stato = 'salvato' | 'da_salvare' | 'salvataggio'

function Editor({ iniziale }: { iniziale: RilievoGrafico }) {
  const [r, setR] = useState(iniziale)
  const [storia, setStoria] = useState<{ indietro: DisegnoGrafico[]; avanti: DisegnoGrafico[] }>({ indietro: [], avanti: [] })
  const [scheda, setScheda] = useState<Scheda>('struttura')
  const [traccia, setTraccia] = useState(false)
  const [selS, setSelS] = useState<SelezioneStruttura>(null)
  const [selP, setSelP] = useState<Set<string>>(new Set())
  const [stato, setStato] = useState<Stato>('salvato')
  const ultimaForma = useRef(0)
  const daSalvare = useRef<RilievoGrafico | null>(null)

  const calc = useMemo(() => calcolaDisegno(r.disegno), [r.disegno])
  const conta = mancanti(calc, r.disegno.profili, r.disegno.riempimenti)

  // Salvataggio automatico nel dispositivo poco dopo ogni modifica (poi parte verso il server)
  useEffect(() => {
    if (stato !== 'da_salvare') return
    const t = setTimeout(() => {
      const x = daSalvare.current
      if (!x) return
      daSalvare.current = null
      setStato('salvataggio')
      void salvaOra(x).then(() => setStato(s => (s === 'salvataggio' ? 'salvato' : s))).catch(() => {
        setStato('da_salvare')
        toast.error('Salvataggio non riuscito nel dispositivo')
      })
    }, 600)
    return () => clearTimeout(t)
  }, [stato, r])

  // Uscendo dalla pagina con una modifica non ancora scritta: si scrive subito
  useEffect(() => () => { if (daSalvare.current) void salvaOra(daSalvare.current) }, [])

  const cambia = (nuovo: RilievoGrafico) => {
    const x = { ...nuovo, aggiornatoAt: new Date().toISOString() }
    daSalvare.current = x
    setR(x)
    setStato('da_salvare')
  }

  const cambiaDisegno = (d: DisegnoGrafico, unisci = false) => {
    if (!unisci) setStoria(s => ({ indietro: [...s.indietro.slice(-60), r.disegno], avanti: [] }))
    cambia({ ...r, disegno: d })
  }
  const cambiaRadice = (radice: Zona, nuovaSel?: SelezioneStruttura) => {
    cambiaDisegno({ ...r.disegno, radice })
    if (nuovaSel !== undefined) setSelS(nuovaSel)
  }
  const cambiaForma = (forma: Forma) => {
    const ora = Date.now()
    // Scrivere una misura cifra per cifra = un solo passo di "annulla"
    const unisci = ora - ultimaForma.current < 1500
    ultimaForma.current = ora
    cambiaDisegno({ ...r.disegno, forma }, unisci)
  }
  const annulla = () => {
    const prec = storia.indietro[storia.indietro.length - 1]
    if (!prec) return
    setStoria(s => ({ indietro: s.indietro.slice(0, -1), avanti: [r.disegno, ...s.avanti] }))
    setSelS(null)
    cambia({ ...r, disegno: prec })
  }
  const ripeti = () => {
    const succ = storia.avanti[0]
    if (!succ) return
    setStoria(s => ({ indietro: [...s.indietro, r.disegno], avanti: s.avanti.slice(1) }))
    setSelS(null)
    cambia({ ...r, disegno: succ })
  }

  const suTraccia = (punti: { x: number; y: number }[]) => {
    const t = interpretaTraccia(calc, punti)
    if (!t) { toast.info('Riga non riconosciuta: tracciala da un lato all\'altro della zona'); return }
    cambiaRadice(dividi(r.disegno.radice, t.zonaId, t.verso, t.posizione, 2), null)
    toast.success(t.posizione.modo === 'uguali' ? `${t.verso === 'montante' ? 'Montante' : 'Traverso'} a metà` : `${t.verso === 'montante' ? 'Montante' : 'Traverso'} a ${t.posizione.quote[0]} mm`)
  }

  const selezioneSvg = scheda === 'struttura' ? new Set(selS ? [selS.id] : []) : selP
  const tocca = (id: string) => {
    if (scheda === 'struttura') return
    setSelP(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PulsanteIndietro fallback="/rilievo/grafico" />
        <Input className="h-9 max-w-xs flex-1 font-semibold" placeholder="Riferimento (es. Veranda terrazzo)" value={r.nome} onChange={e => cambia({ ...r, nome: e.target.value })} />
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {stato === 'salvato' ? <><Check className="size-3.5 text-green-600" />Salvato</> : <><Loader2 className="size-3.5 animate-spin" />Salvataggio…</>}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_2fr]">
        <Input className="h-9" placeholder="Cliente" value={r.cliente} onChange={e => cambia({ ...r, cliente: e.target.value })} />
        <label className="flex items-center gap-1 text-sm text-muted-foreground">Q.tà
          <Input className="h-9" inputMode="numeric" value={String(r.quantita)} onChange={e => { const n = Math.round(Number(e.target.value)); if (n >= 1) cambia({ ...r, quantita: n }) }} />
        </label>
        <Textarea className="min-h-9 py-1.5" rows={1} placeholder="Note" value={r.note} onChange={e => cambia({ ...r, note: e.target.value })} />
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        <Button size="sm" variant={scheda === 'struttura' ? 'default' : 'outline'} onClick={() => setScheda('struttura')}>1 · Struttura</Button>
        <Button size="sm" variant={scheda === 'profili' ? 'default' : 'outline'} onClick={() => { setScheda('profili'); setTraccia(false) }}>
          2 · Profili e vetri
          {(conta.pezzi > 0 || conta.riempimenti > 0) && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] text-red-700">{conta.pezzi + conta.riempimenti}</span>}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-2">
          {scheda === 'struttura' && (
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="outline" className="gap-1" disabled={storia.indietro.length === 0} onClick={annulla}><Undo2 className="size-4" />Annulla</Button>
              <Button size="sm" variant="outline" className="gap-1" disabled={storia.avanti.length === 0} onClick={ripeti}><Redo2 className="size-4" />Ripeti</Button>
              <Button size="sm" variant={traccia ? 'default' : 'outline'} className="gap-1" onClick={() => setTraccia(t => !t)}><PenLine className="size-4" />Traccia{traccia ? ' (attivo)' : ''}</Button>
              {traccia && <span className="text-xs text-muted-foreground">Disegna una riga da un lato all&apos;altro di una zona</span>}
            </div>
          )}
          <div className="rounded-lg border bg-white p-2">
            <DisegnoSvg
              calc={calc}
              modo={scheda === 'profili' ? 'profili' : traccia ? 'traccia' : 'struttura'}
              selezione={selezioneSvg}
              profili={r.disegno.profili}
              riempimenti={r.disegno.riempimenti}
              onZona={id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'zona', id })) : tocca(id))}
              onPezzo={id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'pezzo', id })) : tocca(id))}
              onQuota={id => setSelS({ tipo: 'pezzo', id })}
              onTraccia={suTraccia}
              className="h-[55vh] w-full lg:h-[68vh]"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-3">
          {scheda === 'struttura' ? (
            // Con una zona o un pezzo selezionato i suoi comandi vengono prima (sul telefono sono sotto il disegno)
            <div className={`flex gap-4 ${selS ? 'flex-col' : 'flex-col-reverse'}`}>
              <PannelloStruttura calc={calc} radice={r.disegno.radice} selezione={selS} onRadice={cambiaRadice} />
              <div className={selS ? 'border-t pt-3' : 'border-b pb-3'}>
                <PannelloForma forma={r.disegno.forma} onCambia={cambiaForma} />
              </div>
            </div>
          ) : (
            <PannelloProfili calc={calc} disegno={r.disegno} selezione={selP} onSelezione={setSelP} onDisegno={d => cambiaDisegno(d)} />
          )}
        </div>
      </div>

      {scheda === 'profili' && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-2 py-1.5">Pezzo</th><th className="px-2 py-1.5">Ruolo</th><th className="px-2 py-1.5">Profilo</th><th className="px-2 py-1.5 text-right">Lungh. indicativa</th></tr>
            </thead>
            <tbody>
              {calc.pezzi.map(p => {
                const a = r.disegno.profili[p.id]
                return (
                  <tr key={p.id} className={`cursor-pointer border-t hover:bg-accent ${selP.has(p.id) ? 'bg-orange-50' : ''}`} onClick={() => tocca(p.id)}>
                    <td className="px-2 py-1">{p.nome}</td>
                    <td className="px-2 py-1 text-muted-foreground">{nomeRuolo(p.ruolo)}</td>
                    <td className="px-2 py-1">{a ? <><b>{a.codice}</b> <span className="text-muted-foreground">{a.descrizione ?? ''}</span></> : <span className="text-red-600">da assegnare</span>}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{Math.round(p.lunghezza)} mm</td>
                  </tr>
                )
              })}
              {calc.zone.filter(z => z.foglia && z.materiale).map(z => {
                const a = r.disegno.riempimenti[z.id]
                const valido = a && (!a.materiale || a.materiale === z.materiale)
                return (
                  <tr key={z.id} className={`cursor-pointer border-t hover:bg-accent ${selP.has(z.id) ? 'bg-orange-50' : ''}`} onClick={() => tocca(z.id)}>
                    <td className="px-2 py-1">Zona Z{z.numero}</td>
                    <td className="px-2 py-1 text-muted-foreground">{z.materiale}</td>
                    <td className="px-2 py-1">{valido ? <><b>{a.codice}</b> <span className="text-muted-foreground">{a.descrizione ?? ''}</span></> : <span className="text-red-600">da assegnare</span>}</td>
                    <td className="px-2 py-1" />
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">Lunghezze all&apos;asse o sul bordo della zona, solo per orientarsi: i tagli veri dipendono dai profili.</p>
        </div>
      )}
    </div>
  )
}
