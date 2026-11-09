'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Loader2, PanelRightClose, PanelRightOpen, PenLine, Redo2, Shapes, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/db'
import { salvaVoceLocale } from '@/lib/rilievo-fp-locale'
import { assegnazioniArrivate, assegnazioniDaTenere, conFinituraDi, disegnoDellaVoce, eVoceDisegnata } from '@/lib/rilievo-unico'
import { salvaAssegnazioniGrafico } from '@/actions/rilievo-fp'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { AssegnazioniGrafico, VoceDisegnata, VoceGraficoDati } from '@/types/rilievo-fp'
import type { DisegnoGrafico, Zona } from '@/types/rilievo-grafico'
import { calcolaDisegno, nomeRuolo } from '@/lib/rilievo-grafico/geometria'
import { interpretaTraccia } from '@/lib/rilievo-grafico/traccia'
import { dividi, scriviQuotaTaglio } from '@/lib/rilievo-grafico/modifiche'
import { formaInPunti } from '@/lib/rilievo-grafico/forma'
import { applicaQuota, impostaArco, quoteForma } from '@/lib/rilievo-grafico/quote-forma'
import { mancanti, potaAssegnazioni } from '@/lib/rilievo-grafico/ruoli'
import { conNotaLato, graficoConForma } from '@/lib/rilievo-grafico/scritte-lati'
import DisegnoSvg from './DisegnoSvg'
import CasellaQuota, { type Ancora } from './CasellaQuota'
import MenuLato from './MenuLato'
import SceltaForme from './SceltaForme'
import PannelloStruttura, { type SelezioneStruttura } from './PannelloStruttura'
import PannelloProfili from './PannelloProfili'
import PannelloFinitura from './PannelloFinitura'

/**
 * Voce disegnata del rilievo, aperta dentro la pagina del cantiere: funziona anche senza
 * rete. Il disegno si salva nel dispositivo (e parte con l'invio del rilievo); i profili e i
 * vetri scelti in ufficio vanno subito al server, a parte (servono la rete e la voce inviata).
 */
export default function EditorVoceDisegnata({ voceId, onIndietro }: { voceId: string; onIndietro: () => void }) {
  const v = useLiveQuery(() => db.vociFp.get(voceId).then(x => x ?? null), [voceId])
  if (v === undefined) return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Caricamento…</p>
  if (!v || !eVoceDisegnata(v)) {
    return (
      <div className="space-y-3 p-6">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onIndietro}><ArrowLeft className="size-4" />Indietro</Button>
        <p className="text-sm">Voce non trovata: forse è stata eliminata.</p>
      </div>
    )
  }
  const { daInviare: _d, ...voce } = v
  return <Editor key={voceId} iniziale={voce} arrivate={{ assegnazioni: v.assegnazioni, assegnazioniAt: v.assegnazioniAt }} onIndietro={onIndietro} />
}

/** Scrive il disegno nel dispositivo tenendo le assegnazioni che ci sono adesso (arrivano dal server) */
async function salvaOra(x: VoceDisegnata) {
  const attuale = await db.vociFp.get(x.id)
  await salvaVoceLocale({ ...x, ...assegnazioniDaTenere(attuale, x) })
}

/** Parte del cantiere del disegno: tiene scritte, colori e accessori (le scritte vedi graficoConForma) */
const grafico = (prima: VoceGraficoDati, d: DisegnoGrafico): VoceGraficoDati =>
  ({ ...graficoConForma(prima, d.forma), radice: d.radice, serie: d.serie })
const uguali = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const CHIAVE_PANNELLO = 'rilievo-grafico:pannello'

type Scheda = 'struttura' | 'profili' | 'finitura'
/** Casellina o menù aperti sul disegno */
type Aperta =
  | { tipo: 'forma' | 'taglio'; id: string; valore: number; ancora: Ancora }
  | { tipo: 'lato'; lato: number; ancora: Ancora; scritta: string }

/**
 * All'apertura la forma passa ai punti puliti (i modelli diventano punti, le forme a punti
 * salvate prima vengono girate in senso antiorario): da qui punti, quote e pezzi T0, T1...
 * hanno lo stesso ordine e il menu del lato lavora sul lato toccato.
 */
const aPunti = (x: VoceDisegnata): VoceDisegnata => {
  const punti = formaInPunti(x.grafico.forma)
  return punti.length < 2 ? x : { ...x, grafico: { ...x.grafico, forma: { tipo: 'punti', punti } } }
}
type Stato = 'salvato' | 'da_salvare' | 'salvataggio'

function Editor({ iniziale, arrivate, onIndietro }: {
  iniziale: VoceDisegnata
  /** Assegnazioni nel dispositivo adesso: quelle scelte in ufficio arrivano anche a editor aperto */
  arrivate: Pick<VoceDisegnata, 'assegnazioni' | 'assegnazioniAt'>
  onIndietro: () => void
}) {
  const { isOnline } = useOnlineStatus()
  const [r, setR] = useState(() => aPunti(iniziale))
  const nuoveAssegnazioni = assegnazioniArrivate(r, arrivate)
  if (nuoveAssegnazioni) setR(x => ({ ...x, ...nuoveAssegnazioni }))
  const [storia, setStoria] = useState<{ indietro: VoceGraficoDati[]; avanti: VoceGraficoDati[] }>({ indietro: [], avanti: [] })
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
  const daSalvare = useRef<VoceDisegnata | null>(null)
  // Disegno completo: quello del cantiere + i profili dell'ufficio
  const disegno = useMemo(() => disegnoDellaVoce(r), [r])

  const calc = useMemo(() => calcolaDisegno(disegno), [disegno])
  const conta = mancanti(calc, disegno.profili, disegno.riempimenti)
  const punti = useMemo(() => formaInPunti(r.grafico.forma), [r.grafico.forma])
  const quote = useMemo(() => quoteForma(punti), [punti])

  // Cambiando la larghezza della finestra la casellina non sarebbe piu' al suo posto. Solo la
  // larghezza: sul telefono la tastiera che si apre cambia l'altezza e non deve chiuderla.
  useEffect(() => {
    let larghezza = window.innerWidth
    const chiudi = () => {
      if (Math.abs(window.innerWidth - larghezza) < 2) return
      larghezza = window.innerWidth
      setAperta(null)
    }
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

  // Ultimo stato e scritta del lato in corso: servono uscendo col tasto indietro del telefono,
  // quando la vista si chiude senza passare dai pulsanti dell'editor.
  const ultimo = useRef(r)
  useEffect(() => { ultimo.current = r }, [r])
  const scrittaInCorso = useRef<{ lato: number; testo: string } | null>(null)
  // Uscendo dalla pagina con una modifica non ancora scritta: si scrive subito
  useEffect(() => () => {
    const n = scrittaInCorso.current
    const base = daSalvare.current ?? ultimo.current
    if (n && n.testo.trim() !== (base.grafico.noteLati?.[n.lato] ?? '')) {
      void salvaOra({ ...base, grafico: conNotaLato(base.grafico, n.lato, n.testo), aggiornatoAt: new Date().toISOString() })
    } else if (daSalvare.current) void salvaOra(daSalvare.current)
  }, [])

  const cambia = (nuovo: VoceDisegnata) => {
    const x = { ...nuovo, aggiornatoAt: new Date().toISOString() }
    daSalvare.current = x
    setR(x)
    setStato('da_salvare')
  }

  /** Profili e vetri dell'ufficio: subito al server (non tocca il disegno ne' la data della voce) */
  const salvaAssegnazioni = async (a: AssegnazioniGrafico) => {
    const pulite = potaAssegnazioni(calc, a.profili, a.riempimenti)
    const prima = r.assegnazioni ?? null
    setR(x => ({ ...x, assegnazioni: pulite }))
    const esito = await salvaAssegnazioniGrafico(r.id, pulite)
    if ('errore' in esito) {
      setR(x => ({ ...x, assegnazioni: prima }))
      toast.error(esito.errore)
      return
    }
    await db.vociFp.update(r.id, { assegnazioni: pulite, assegnazioniAt: esito.assegnazioniAt })
  }

  /** `base`: da dove parte il disegno nuovo (di solito quello di adesso; con una scritta appena scritta, quello con la scritta) */
  const cambiaDisegno = (d: DisegnoGrafico, unisci = false, base: VoceGraficoDati = r.grafico) => {
    const a = { profili: d.profili, riempimenti: d.riempimenti }
    if (!uguali(a, { profili: disegno.profili, riempimenti: disegno.riempimenti })) void salvaAssegnazioni(a)
    const g = grafico(base, d)
    if (uguali(g, r.grafico)) return
    if (!unisci) setStoria(s => ({ indietro: [...s.indietro.slice(-60), r.grafico], avanti: [] }))
    cambia({ ...r, grafico: g })
  }
  /** Scritte dei lati: un passo di Annulla come il resto del disegno */
  const cambiaGrafico = (g: VoceGraficoDati) => {
    if (uguali(g, r.grafico)) return
    setStoria(s => ({ indietro: [...s.indietro.slice(-60), r.grafico], avanti: [] }))
    cambia({ ...r, grafico: g })
  }
  /** Colori e accessori (scheda 3): fuori da Annulla, che resta del disegno */
  const cambiaFinitura = (g: VoceGraficoDati) => {
    if (!uguali(g, r.grafico)) cambia({ ...r, grafico: g })
  }
  const cambiaRadice = (radice: Zona, nuovaSel?: SelezioneStruttura) => {
    cambiaDisegno({ ...disegno, radice })
    if (nuovaSel !== undefined) setSelS(nuovaSel)
  }
  /** Applica una nuova forma a punti: un passo di Annulla per ogni conferma */
  const nuovaForma = (p: ReturnType<typeof applicaQuota>, base?: VoceGraficoDati) => {
    if (!p) return false
    cambiaDisegno({ ...disegno, forma: { tipo: 'punti', punti: p } }, false, base)
    return true
  }
  /** Disegno con la scritta del lato che si sta scrivendo nel menu (se cambiata) */
  const conScrittaInCorso = (): VoceGraficoDati =>
    aperta?.tipo === 'lato' && aperta.scritta.trim() !== (r.grafico.noteLati?.[aperta.lato] ?? '')
      ? conNotaLato(r.grafico, aperta.lato, aperta.scritta)
      : r.grafico
  /** Apre o chiude casellina e menu: la scritta del lato in corso si salva comunque si esca */
  const apri = (x: Aperta | null) => {
    scrittaInCorso.current = null
    cambiaGrafico(conScrittaInCorso())
    setAperta(x)
  }
  const confermaAperta = (n: number): boolean => {
    if (!aperta || aperta.tipo === 'lato') return false
    if (aperta.tipo === 'forma') {
      if (!nuovaForma(applicaQuota(punti, aperta.id, n))) return false
    } else {
      const radice = scriviQuotaTaglio(r.grafico.radice, calc, aperta.id, n)
      if (!radice) return false
      cambiaRadice(radice, { tipo: 'pezzo', id: aperta.id })
    }
    setAperta(null)
    return true
  }
  const chiudiAperta = () => apri(null)

  const annulla = () => {
    setAperta(null)
    const prec = storia.indietro[storia.indietro.length - 1]
    if (!prec) return
    setStoria(s => ({ indietro: s.indietro.slice(0, -1), avanti: [r.grafico, ...s.avanti] }))
    setSelS(null)
    cambia({ ...r, grafico: conFinituraDi(prec, r.grafico) })
  }
  const ripeti = () => {
    setAperta(null)
    const succ = storia.avanti[0]
    if (!succ) return
    setStoria(s => ({ indietro: [...s.indietro, r.grafico], avanti: s.avanti.slice(1) }))
    setSelS(null)
    cambia({ ...r, grafico: conFinituraDi(succ, r.grafico) })
  }

  const suTraccia = (punti: { x: number; y: number }[]) => {
    const t = interpretaTraccia(calc, punti)
    if (!t) { toast.info('Riga non riconosciuta: tracciala da un lato all\'altro della zona'); return }
    cambiaRadice(dividi(r.grafico.radice, t.zonaId, t.verso, t.posizione, 2), null)
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
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { apri(null); onIndietro() }}><ArrowLeft className="size-4" />Rilievo</Button>
        <Input className="h-9 max-w-xs flex-1 font-semibold" placeholder="Posizione (es. Cucina)" value={r.posizione} onChange={e => cambia({ ...r, posizione: e.target.value })} />
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {stato === 'salvato' ? <><Check className="size-3.5 text-green-600" />Salvato</> : <><Loader2 className="size-3.5 animate-spin" />Salvataggio…</>}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[6rem_1fr]">
        <label className="flex items-center gap-1 text-sm text-muted-foreground">Q.tà
          <Input className="h-9" inputMode="numeric" value={String(r.quantita)} onChange={e => { const n = Math.round(Number(e.target.value)); if (n >= 1) cambia({ ...r, quantita: n }) }} />
        </label>
        <Textarea className="min-h-9 py-1.5" rows={1} placeholder="Note" value={r.note} onChange={e => cambia({ ...r, note: e.target.value })} />
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        <Button size="sm" variant={scheda === 'struttura' ? 'default' : 'outline'} onClick={() => { setScheda('struttura'); apri(null) }}>1 · Struttura</Button>
        <Button size="sm" variant={scheda === 'profili' ? 'default' : 'outline'} onClick={() => { setScheda('profili'); setTraccia(false); apri(null) }}>
          2 · Profili e vetri
          {(conta.pezzi > 0 || conta.riempimenti > 0) && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] text-red-700">{conta.pezzi + conta.riempimenti}</span>}
        </Button>
        <Button size="sm" variant={scheda === 'finitura' ? 'default' : 'outline'} onClick={() => { setScheda('finitura'); setTraccia(false); apri(null) }}>3 · Colori e accessori</Button>
      </div>

      <div className={`grid gap-3 ${pannelloAperto || scheda === 'finitura' ? 'lg:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {scheda === 'struttura' && (
              <>
                <Button size="sm" variant="outline" className="gap-1" disabled={storia.indietro.length === 0} onClick={annulla}><Undo2 className="size-4" />Annulla</Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={storia.avanti.length === 0} onClick={ripeti}><Redo2 className="size-4" />Ripeti</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { apri(null); setScegliForma(true) }}><Shapes className="size-4" />Forme</Button>
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
              profili={disegno.profili}
              scritteLati={r.grafico.noteLati}
              riempimenti={disegno.riempimenti}
              quoteForma={quote}
              // Scheda 3 (colori e accessori): il disegno e' solo da guardare
              onZona={scheda === 'finitura' ? undefined : id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'zona', id })) : tocca(id))}
              onPezzo={scheda === 'finitura' ? undefined : id => (scheda === 'struttura' ? setSelS(s => (s?.id === id ? null : { tipo: 'pezzo', id })) : tocca(id))}
              onQuota={scheda === 'finitura' ? undefined : (id, ancora) => {
                setSelS({ tipo: 'pezzo', id })
                const q = calc.quote.find(x => x.id === id)
                if (q) apri({ tipo: 'taglio', id, valore: q.valore, ancora })
              }}
              onQuotaForma={scheda === 'struttura' ? (id, ancora) => {
                const q = quote.find(x => x.id === id)
                if (q) apri({ tipo: 'forma', id, valore: q.valore, ancora })
              } : undefined}
              onLato={scheda === 'struttura' ? (lato, ancora) => apri({ tipo: 'lato', lato, ancora, scritta: r.grafico.noteLati?.[lato] ?? '' }) : undefined}
              onTraccia={suTraccia}
              className="h-[55vh] w-full lg:h-[68vh]"
            />
            {aperta && aperta.tipo !== 'lato' && (
              <CasellaQuota key={`${aperta.tipo}-${aperta.id}`} ancora={aperta.ancora} valore={aperta.valore} conSegno={/^F\d+$/.test(aperta.id)} onConferma={confermaAperta} onAnnulla={chiudiAperta} />
            )}
            {aperta?.tipo === 'lato' && (
              <MenuLato key={aperta.lato}
                ancora={aperta.ancora}
                arco={Boolean(punti[aperta.lato]?.freccia)}
                onArco={() => apri({ tipo: 'forma', id: `F${aperta.lato}`, valore: Math.round(punti[aperta.lato]?.freccia ?? 0), ancora: aperta.ancora })}
                // Un solo passo: arco tolto e scritta appena scritta insieme (prima la scritta si perdeva)
                onDritto={() => { nuovaForma(impostaArco(punti, aperta.lato, 0), conScrittaInCorso()); setAperta(null) }}
                onChiudi={chiudiAperta}
                scritta={aperta.scritta}
                onScritta={testo => { scrittaInCorso.current = { lato: aperta.lato, testo }; setAperta({ ...aperta, scritta: testo }) }}
              />
            )}
          </div>
        </div>

        {(pannelloAperto || scheda === 'finitura') && (
          <div className="space-y-4 rounded-lg border p-3">
            {scheda === 'finitura' ? (
              <PannelloFinitura g={r.grafico} onCambia={cambiaFinitura} />
            ) : scheda === 'struttura' ? (
              <PannelloStruttura calc={calc} radice={r.grafico.radice} selezione={selS} onRadice={cambiaRadice} />
            ) : isOnline ? (
              <PannelloProfili calc={calc} disegno={disegno} selezione={selP} onSelezione={setSelP} onDisegno={d => cambiaDisegno(d)} />
            ) : (
              <p className="text-sm text-amber-700">Per scegliere profili e vetri serve la rete (e la voce già inviata).</p>
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
                const a = disegno.profili[p.id]
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
                const a = disegno.riempimenti[z.id]
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
