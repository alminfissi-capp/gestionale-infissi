'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Loader2, PanelRightClose, PanelRightOpen, PenLine, Redo2, Shapes, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import PulsanteIndietro from '@/components/layout/PulsanteIndietro'
import { db } from '@/lib/db'
import type { DisegnoGrafico, RilievoGrafico, Zona } from '@/types/rilievo-grafico'
import { calcolaDisegno, nomeRuolo } from '@/lib/rilievo-grafico/geometria'
import { interpretaTraccia } from '@/lib/rilievo-grafico/traccia'
import { dividi, scriviQuotaTaglio } from '@/lib/rilievo-grafico/modifiche'
import { formaInPunti } from '@/lib/rilievo-grafico/forma'
import { applicaQuota, impostaArco, quoteForma } from '@/lib/rilievo-grafico/quote-forma'
import { mancanti, potaAssegnazioni } from '@/lib/rilievo-grafico/ruoli'
import DisegnoSvg from './DisegnoSvg'
import CasellaQuota, { type Ancora } from './CasellaQuota'
import MenuLato from './MenuLato'
import SceltaForme from './SceltaForme'
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

const CHIAVE_PANNELLO = 'rilievo-grafico:pannello'

type Scheda = 'struttura' | 'profili'
/** Casellina o menù aperti sul disegno */
type Aperta =
  | { tipo: 'forma' | 'taglio'; id: string; valore: number; ancora: Ancora }
  | { tipo: 'lato'; lato: number; ancora: Ancora }

/** I rilievi salvati con un modello passano subito alla forma a punti (si modifica lato per lato) */
const aPunti = (x: RilievoGrafico): RilievoGrafico =>
  x.disegno.forma.tipo === 'punti' ? x : { ...x, disegno: { ...x.disegno, forma: { tipo: 'punti', punti: formaInPunti(x.disegno.forma) } } }
type Stato = 'salvato' | 'da_salvare' | 'salvataggio'

function Editor({ iniziale }: { iniziale: RilievoGrafico }) {
  const [r, setR] = useState(() => aPunti(iniziale))
  const [storia, setStoria] = useState<{ indietro: DisegnoGrafico[]; avanti: DisegnoGrafico[] }>({ indietro: [], avanti: [] })
  const [scheda, setScheda] = useState<Scheda>('struttura')
  const [traccia, setTraccia] = useState(false)
  const [selS, setSelS] = useState<SelezioneStruttura>(null)
  const [selP, setSelP] = useState<Set<string>>(new Set())
  const [stato, setStato] = useState<Stato>('salvato')
  const [aperta, setAperta] = useState<Aperta | null>(null)
  const [scegliForma, setScegliForma] = useState(false)
  // Pannello laterale apribile e richiudibile: il dispositivo si ricorda com'era
  const [pannelloAperto, setPannelloAperto] = useState(() => {
    try { return localStorage.getItem(CHIAVE_PANNELLO) !== 'chiuso' } catch { return true }
  })
  const cambiaPannello = (v: boolean) => {
    setPannelloAperto(v)
    try { localStorage.setItem(CHIAVE_PANNELLO, v ? 'aperto' : 'chiuso') } catch { /* niente memoria nel dispositivo: pazienza */ }
  }
  const daSalvare = useRef<RilievoGrafico | null>(null)

  const calc = useMemo(() => calcolaDisegno(r.disegno), [r.disegno])
  const conta = mancanti(calc, r.disegno.profili, r.disegno.riempimenti)
  const punti = useMemo(() => formaInPunti(r.disegno.forma), [r.disegno.forma])
  const quote = useMemo(() => quoteForma(punti), [punti])

  // Cambiando la grandezza della finestra la casellina non sarebbe piu' al suo posto
  useEffect(() => {
    const chiudi = () => setAperta(null)
    window.addEventListener('resize', chiudi)
    return () => window.removeEventListener('resize', chiudi)
  }, [])

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
  /** Applica una nuova forma a punti: un passo di Annulla per ogni conferma */
  const nuovaForma = (p: ReturnType<typeof applicaQuota>) => {
    if (!p) return false
    cambiaDisegno({ ...r.disegno, forma: { tipo: 'punti', punti: p } })
    return true
  }
  const confermaAperta = (n: number): boolean => {
    if (!aperta || aperta.tipo === 'lato') return false
    if (aperta.tipo === 'forma') {
      if (!nuovaForma(applicaQuota(punti, aperta.id, n))) return false
    } else {
      const radice = scriviQuotaTaglio(r.disegno.radice, calc, aperta.id, n)
      if (!radice) return false
      cambiaRadice(radice, { tipo: 'pezzo', id: aperta.id })
    }
    setAperta(null)
    return true
  }
  const chiudiAperta = () => setAperta(null)

  const annulla = () => {
    setAperta(null)
    const prec = storia.indietro[storia.indietro.length - 1]
    if (!prec) return
    setStoria(s => ({ indietro: s.indietro.slice(0, -1), avanti: [r.disegno, ...s.avanti] }))
    setSelS(null)
    cambia({ ...r, disegno: prec })
  }
  const ripeti = () => {
    setAperta(null)
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
        <Button size="sm" variant={scheda === 'struttura' ? 'default' : 'outline'} onClick={() => { setScheda('struttura'); setAperta(null) }}>1 · Struttura</Button>
        <Button size="sm" variant={scheda === 'profili' ? 'default' : 'outline'} onClick={() => { setScheda('profili'); setTraccia(false); setAperta(null) }}>
          2 · Profili e vetri
          {(conta.pezzi > 0 || conta.riempimenti > 0) && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] text-red-700">{conta.pezzi + conta.riempimenti}</span>}
        </Button>
      </div>

      <div className={`grid gap-3 ${pannelloAperto ? 'lg:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {scheda === 'struttura' && (
              <>
                <Button size="sm" variant="outline" className="gap-1" disabled={storia.indietro.length === 0} onClick={annulla}><Undo2 className="size-4" />Annulla</Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={storia.avanti.length === 0} onClick={ripeti}><Redo2 className="size-4" />Ripeti</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setAperta(null); setScegliForma(true) }}><Shapes className="size-4" />Forme</Button>
                <Button size="sm" variant={traccia ? 'default' : 'outline'} className="gap-1" onClick={() => setTraccia(t => !t)}><PenLine className="size-4" />Traccia{traccia ? ' (attivo)' : ''}</Button>
              </>
            )}
            <Button size="sm" variant={pannelloAperto ? 'secondary' : 'outline'} className="ml-auto gap-1" onClick={() => cambiaPannello(!pannelloAperto)}>
              {pannelloAperto ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              {pannelloAperto ? 'Chiudi pannello' : 'Apri pannello'}
            </Button>
            {scheda === 'struttura' && traccia && <span className="w-full text-xs text-muted-foreground">Disegna una riga da un lato all&apos;altro di una zona</span>}
          </div>
          <div className="relative rounded-lg border bg-white p-2">
            <DisegnoSvg
              calc={calc}
              modo={scheda === 'profili' ? 'profili' : traccia ? 'traccia' : 'struttura'}
              selezione={selezioneSvg}
              profili={r.disegno.profili}
              riempimenti={r.disegno.riempimenti}
              quoteForma={quote}
              onZona={id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'zona', id })) : tocca(id))}
              onPezzo={id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'pezzo', id })) : tocca(id))}
              onQuota={(id, ancora) => {
                setSelS({ tipo: 'pezzo', id })
                const q = calc.quote.find(x => x.id === id)
                if (q) setAperta({ tipo: 'taglio', id, valore: q.valore, ancora })
              }}
              onQuotaForma={scheda === 'struttura' ? (id, ancora) => {
                const q = quote.find(x => x.id === id)
                if (q) setAperta({ tipo: 'forma', id, valore: q.valore, ancora })
              } : undefined}
              onLato={scheda === 'struttura' ? (lato, ancora) => setAperta({ tipo: 'lato', lato, ancora }) : undefined}
              onTraccia={suTraccia}
              className="h-[55vh] w-full lg:h-[68vh]"
            />
            {aperta && aperta.tipo !== 'lato' && (
              <CasellaQuota key={`${aperta.tipo}-${aperta.id}`} ancora={aperta.ancora} valore={aperta.valore} onConferma={confermaAperta} onAnnulla={chiudiAperta} />
            )}
            {aperta?.tipo === 'lato' && (
              <MenuLato
                ancora={aperta.ancora}
                arco={Boolean(punti[aperta.lato]?.freccia)}
                onArco={() => setAperta({ tipo: 'forma', id: `F${aperta.lato}`, valore: Math.round(punti[aperta.lato]?.freccia ?? 0), ancora: aperta.ancora })}
                onDritto={() => { nuovaForma(impostaArco(punti, aperta.lato, 0)); setAperta(null) }}
                onChiudi={chiudiAperta}
              />
            )}
          </div>
        </div>

        {pannelloAperto && (
          <div className="space-y-4 rounded-lg border p-3">
            {scheda === 'struttura' ? (
              <PannelloStruttura calc={calc} radice={r.disegno.radice} selezione={selS} onRadice={cambiaRadice} />
            ) : (
              <PannelloProfili calc={calc} disegno={r.disegno} selezione={selP} onSelezione={setSelP} onDisegno={d => cambiaDisegno(d)} />
            )}
          </div>
        )}
      </div>
      <SceltaForme aperta={scegliForma} onChiudi={() => setScegliForma(false)} onScegli={p => nuovaForma(p)} larghezza={calc.larghezza} altezza={calc.altezza} />

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
