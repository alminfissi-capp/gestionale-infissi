'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/db'
import { salvaVoceLocale } from '@/lib/rilievo-fp-locale'
import {
  campiRiempimento, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
} from '@/lib/fppro/rilievo-fp'
import { profiliPer, UTILIZZI_ANTA, UTILIZZO_TELAIO } from '@/lib/fppro/profili-voce'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import DisegnoConNote from './DisegnoConNote'
import SceltaFp, { type VoceScelta } from './SceltaFp'
import SceltaTipologia from './SceltaTipologia'
import type { AnteprimaProfilo, Lato, RifFp, StrutturaLocale, TelaioLocale, VoceFp, VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  rilievoId: string
  voceId: string | null
  onFine: () => void
}

const LATI: { lato: Lato; etichetta: string }[] = [
  { lato: 'sinistra', etichetta: 'Sinistro' },
  { lato: 'alto', etichetta: 'Superiore' },
  { lato: 'destra', etichetta: 'Destro' },
  { lato: 'basso', etichetta: 'Inferiore' },
]

const numero = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

const haAnte = (albero: NodoStruttura[]): boolean =>
  albero.some(n => n.tipo === 8610 || n.tipo === 8620 || haAnte(n.figli))

/** Pannello richiudibile a destra del disegno. */
function Pannello({ titolo, children, aperto = true }: { titolo: string; children: ReactNode; aperto?: boolean }) {
  return (
    <details open={aperto} className="group rounded-md border bg-background">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold">
        {titolo}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t px-3 py-2">{children}</div>
    </details>
  )
}

/**
 * Voce del rilievo in un'unica schermata, come in FP PRO: in cima riferimento e misure, al
 * centro il disegno con le note del telaio sui 4 lati, a destra i pannelli delle scelte.
 * Gli elenchi sono menu a tendina che si chiudono dopo la scelta (SceltaFp).
 */
export default function SchermataVoce({ rilievoId, voceId, onFine }: Props) {
  const esistente = useLiveQuery(() => (voceId ? db.vociFp.get(voceId) : undefined), [voceId])
  const [bozza, setBozza] = useState<VoceFp | null>(null)
  // true = ci sono modifiche non ancora salvate nel telefono
  const [sporca, setSporca] = useState(false)
  const voce = bozza ?? esistente ?? null
  const [serieScelta, setSerieScelta] = useState<string | null>(null)
  const [cambiaStruttura, setCambiaStruttura] = useState(false)
  const [quantitaTesto, setQuantitaTesto] = useState<string | null>(null)

  // undefined = sto cercando, null = struttura non presente nel telefono
  const struttura = useLiveQuery(
    async () => (voce ? (await db.fpStrutture.get(voce.fp.strutturaId)) ?? null : undefined),
    [voce?.fp.strutturaId],
  )
  const catalogoVuoto = useLiveQuery(async () => (await db.fpStrutture.count()) === 0, [], false)

  // Uscendo con il tasto indietro del telefono le modifiche non vanno perse.
  const daSalvare = useRef<VoceFp | null>(null)
  useEffect(() => { daSalvare.current = sporca ? bozza : null }, [bozza, sporca])
  useEffect(() => () => { if (daSalvare.current) void salvaVoceLocale(daSalvare.current) }, [])

  const elencoSerie = useLiveQuery(() => db.fpSerie.orderBy('nome').filter(s => s.presente).toArray(), [], [])
  const serieRecenti = useLiveQuery(async () => {
    const v = await db.vociFp.orderBy('aggiornatoAt').reverse().limit(100).toArray()
    return [...new Set(v.map(x => x.fp.serie))].slice(0, 5)
  }, [], [] as string[])
  const colori = useLiveQuery(() => db.fpColori.filter(c => c.presente).toArray(), [], [])
  const vetri = useLiveQuery(() => db.fpVetri.filter(v => v.presente).toArray(), [], [])
  const preferenze = useLiveQuery(() => db.fpPreferenze.toArray(), [], [])
  const nomeSerie = serieScelta ?? voce?.fp.serie ?? null
  const serieFp = useLiveQuery(() => (nomeSerie ? db.fpSerie.where('nome').equals(nomeSerie).first() : undefined), [nomeSerie])
  const profiliSerie = useLiveQuery(
    () => (serieFp ? db.fpTelai.where('serie_fp_id').equals(serieFp.fp_id).toArray() : [] as TelaioLocale[]),
    [serieFp?.fp_id], [] as TelaioLocale[],
  )
  const miniature = useLiveQuery(async () => {
    const codici = [...new Set(profiliSerie.map(p => p.codice))]
    const righe = codici.length ? await db.fpSezioni.where('codice').anyOf(codici).toArray() : []
    return new Map(righe.map(r => [r.codice.toUpperCase(), r.anteprima]))
  }, [profiliSerie], new Map<string, AnteprimaProfilo | null>())

  const divisioni = useMemo(() => (struttura ? divisioniStruttura(struttura.albero) : []), [struttura])
  const campi = useMemo(() => (struttura ? campiRiempimento(struttura.albero) : []), [struttura])
  const kit = useMemo(() => (struttura ? kitOpzionali(struttura.albero) : []), [struttura])
  const telaiDefault = useMemo(() => (struttura ? telaiStruttura(struttura.albero) : {}), [struttura])

  const pref = (tipo: 'colore' | 'vetro') => new Set(preferenze.filter(p => p.tipo === tipo).map(p => String(p.rif)))
  const vociProfili = (utilizzi: number[]): VoceScelta[] =>
    profiliPer(profiliSerie, serieFp?.fp_id, utilizzi).map(p => ({
      id: p.codice, testo: p.codice, sotto: p.descrizione, miniatura: miniature.get(p.codice.toUpperCase()) ?? null,
    }))
  const vociColori = (perAccessori: boolean): VoceScelta[] => colori
    .filter(c => (perAccessori ? c.per_accessori === true : c.per_profili !== false))
    .map(c => ({ id: String(c.fp_id), testo: c.descrizione }))
  const vociVetri: VoceScelta[] = vetri.map(x => ({ id: String(x.fp_id), testo: x.codice, sotto: x.descrizione }))
  const vociSerie: VoceScelta[] = [...elencoSerie]
    .sort((a, b) => Number(serieRecenti.includes(b.nome)) - Number(serieRecenti.includes(a.nome)))
    .map(s => ({ id: s.nome, testo: s.nome, sotto: [s.descrizione, serieRecenti.includes(s.nome) ? 'recente' : null].filter(Boolean).join(' · ') }))

  const aggiorna = (patch: Partial<VoceFpDati>, altro: Partial<VoceFp> = {}) => {
    if (!voce) return
    setBozza({ ...voce, ...altro, fp: { ...voce.fp, ...patch } })
    setSporca(true)
  }

  // Si salva solo se qualcosa e' cambiato: aprire e chiudere una voce non deve renderla
  // "piu' recente" di una modifica vera fatta su un altro telefono.
  const salva = async (chiudi: boolean, avviso = true) => {
    if (voce && sporca) {
      await salvaVoceLocale(voce)
      setSporca(false)
      daSalvare.current = null
      if (avviso) toast.success('Voce salvata')
    }
    if (chiudi) onFine()
  }

  // Struttura scelta: voce nuova, oppure la stessa voce con un'altra struttura (restano
  // misure, riferimento, quantita', note e note del telaio).
  const sceltaStruttura = async (s: StrutturaLocale) => {
    const ordine = await db.vociFp.where('rilievoId').equals(rilievoId).count()
    const nuova: VoceFp = {
      id: voce?.id ?? crypto.randomUUID(),
      rilievoId,
      ordine: voce?.ordine ?? ordine,
      posizione: voce?.posizione ?? '',
      quantita: voce?.quantita ?? 1,
      note: voce?.note ?? '',
      fp: {
        ...nuovaVoceFp(s, serieScelta ?? voce?.fp.serie ?? s.serie[0]),
        larghezza: voce?.fp.larghezza ?? null,
        altezza: voce?.fp.altezza ?? null,
        noteTelaio: voce?.fp.noteTelaio,
      },
      aggiornatoAt: new Date().toISOString(),
    }
    setBozza(nuova)
    setSporca(false)
    setCambiaStruttura(false)
    await salvaVoceLocale(nuova)
  }

  const v = voce?.fp
  const testata = (
    <div className="sticky top-0 z-10 flex flex-wrap items-end gap-2 border-b bg-background py-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void salva(true, false)}>
        <ArrowLeft className="size-4" />Indietro
      </Button>
      {voce && v && (
        <>
          <div className="w-44">
            <Label htmlFor="sv-pos" className="text-xs">Rif. cantiere</Label>
            <Input id="sv-pos" className="h-8" value={voce.posizione} placeholder="es. cucina sx" onChange={e => aggiorna({}, { posizione: e.target.value })} />
          </div>
          <div className="w-24">
            <Label htmlFor="sv-l" className="text-xs">Larghezza</Label>
            <Input id="sv-l" className="h-8" inputMode="numeric" readOnly={struttura === null} value={v.larghezza ?? ''} onChange={e => aggiorna({ larghezza: numero(e.target.value) })} />
          </div>
          <div className="w-24">
            <Label htmlFor="sv-h" className="text-xs">Altezza</Label>
            <Input id="sv-h" className="h-8" inputMode="numeric" readOnly={struttura === null} value={v.altezza ?? ''} onChange={e => aggiorna({ altezza: numero(e.target.value) })} />
          </div>
          <div className="w-16">
            <Label htmlFor="sv-q" className="text-xs">Q.tà</Label>
            <Input id="sv-q" className="h-8" inputMode="numeric" value={quantitaTesto ?? String(voce.quantita)} onBlur={() => setQuantitaTesto(null)}
              onChange={e => {
                // Si puo' svuotare il campo mentre si scrive; vale solo un intero da 1 in su.
                setQuantitaTesto(e.target.value)
                const n = numero(e.target.value)
                if (n !== null && n >= 1) aggiorna({}, { quantita: Math.round(n) })
              }} />
          </div>
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => void salva(true)}><Save className="size-4" />Salva</Button>
        </>
      )}
    </div>
  )

  // Scelta di serie e struttura: voce nuova, o "Cambia" dal pannello.
  const sceltaSerieStruttura = (
    <div className="space-y-3">
      <div className="max-w-md space-y-1">
        <Label>Serie</Label>
        <SceltaFp voci={vociSerie} valore={nomeSerie} segnaposto="Cerca serie" onScegli={s => setSerieScelta(s?.id ?? null)} />
      </div>
      {nomeSerie
        ? <SceltaTipologia serie={nomeSerie} onScegli={s => void sceltaStruttura(s)} />
        : <p className="text-sm text-muted-foreground">Scegli la serie per vedere le strutture.</p>}
      {voce && <Button variant="ghost" size="sm" onClick={() => { setCambiaStruttura(false); setSerieScelta(null) }}>Annulla</Button>}
    </div>
  )

  if (!voceId && !bozza) return <div className="space-y-3">{testata}{sceltaSerieStruttura}</div>
  if (!voce || !v || struttura === undefined) return <div className="space-y-3">{testata}<p className="text-sm text-muted-foreground">Caricamento…</p></div>
  if (cambiaStruttura) return <div className="space-y-3">{testata}{sceltaSerieStruttura}</div>

  if (struttura === null) {
    return (
      <div className="space-y-3">
        {testata}
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {catalogoVuoto
            ? 'Il catalogo FP PRO non è ancora nel telefono: aggiornalo quando c\'è rete per vedere disegno e opzioni.'
            : `La struttura "${v.nome}" non è più nel catalogo FP PRO. Le misure restano salvate; si possono cambiare solo riferimento, quantità e note.`}
        </p>
        <p className="text-sm">{v.serie} · {v.nome} · {v.larghezza ?? '?'} × {v.altezza ?? '?'} mm</p>
        <div className="max-w-xl"><Label htmlFor="sv-note-m">Note</Label><Textarea id="sv-note-m" rows={3} value={voce.note} onChange={e => aggiorna({}, { note: e.target.value })} /></div>
      </div>
    )
  }

  const problemi = problemiVoce(v, divisioni)
  const latiTelaio = LATI.filter(l => telaiDefault[l.lato])
  const campiVetro = campi.filter(c => c.tipo === 'vetro')
  const rif = (x: VoceScelta | null): RifFp | null => (x ? { fpId: Number(x.id), descrizione: x.testo } : null)

  return (
    <div className="space-y-3">
      {testata}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{v.serie}</span> · {v.nome}
            {!struttura.presente && <span className="ml-2 text-amber-700">struttura non più presente in FP PRO</span>}
          </p>
          <DisegnoConNote
            struttura={struttura}
            voce={v}
            note={v.noteTelaio ?? {}}
            onNota={(lato, testo) => {
              const note = { ...(v.noteTelaio ?? {}) }
              if (testo) note[lato] = testo; else delete note[lato]
              aggiorna({ noteTelaio: note })
            }}
          />
          {divisioni.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {divisioni.map(d => {
                const totale = d.tipo === 'traverso' ? (v.altezza ?? struttura.h_nominale) : (v.larghezza ?? struttura.l_nominale)
                const nominaleTot = d.tipo === 'traverso' ? struttura.h_nominale : struttura.l_nominale
                const proporzionale = totale && nominaleTot ? Math.round((d.nominale * totale) / nominaleTot) : null
                return (
                  <div key={d.codice}>
                    <Label htmlFor={`sv-d${d.codice}`} className="text-xs">{d.etichetta} {d.tipo === 'traverso' ? '(dal basso)' : '(da sinistra)'}</Label>
                    <Input id={`sv-d${d.codice}`} className="h-8" inputMode="numeric" placeholder={proporzionale ? `≈ ${proporzionale}` : ''} value={v.quote[d.codice] ?? ''}
                      onChange={e => {
                        const n = numero(e.target.value)
                        const quote = { ...v.quote }
                        if (n === null) delete quote[d.codice]; else quote[d.codice] = n
                        aggiorna({ quote })
                      }} />
                  </div>
                )
              })}
            </div>
          )}
          {problemi.length > 0 && <ul className="text-sm text-amber-700">{problemi.map(p => <li key={p}>{p}</li>)}</ul>}
        </div>

        <div className="space-y-2">
          <Pannello titolo="Serie e struttura">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{v.serie} · {v.nome}</span>
              <Button variant="outline" size="sm" onClick={() => { setSerieScelta(v.serie); setCambiaStruttura(true) }}>Cambia</Button>
            </div>
          </Pannello>

          {latiTelaio.length > 0 && (
            <Pannello titolo="Telai">
              {latiTelaio.map(({ lato, etichetta }) => (
                <div key={lato} className="space-y-1">
                  <Label className="text-xs">{etichetta}</Label>
                  <SceltaFp
                    voci={vociProfili([UTILIZZO_TELAIO])}
                    valore={v.telai[lato] ?? null}
                    segnaposto="Cerca telaio"
                    etichettaNessuno={`Come la struttura (${telaiDefault[lato]})`}
                    conMiniature
                    riserva={v.telai[lato] ? { id: v.telai[lato]!, testo: v.telai[lato]! } : null}
                    onScegli={x => {
                      const telai = { ...v.telai }
                      if (x) telai[lato] = x.id; else delete telai[lato]
                      aggiorna({ telai })
                    }}
                  />
                </div>
              ))}
            </Pannello>
          )}

          {haAnte(struttura.albero) && (
            <Pannello titolo="Anta">
              <SceltaFp
                voci={vociProfili(UTILIZZI_ANTA)}
                valore={v.anta ?? null}
                segnaposto="Cerca profilo anta"
                etichettaNessuno="Come la struttura"
                conMiniature
                riserva={v.anta ? { id: v.anta, testo: v.anta } : null}
                onScegli={x => aggiorna({ anta: x?.id ?? null })}
              />
            </Pannello>
          )}

          <Pannello titolo="Colori">
            {([['coloreInt', 'Interno', false], ['coloreEst', 'Esterno', false], ['coloreAcc', 'Accessori', true]] as const).map(([campo, etichetta, perAcc]) => (
              <div key={campo} className="space-y-1">
                <Label className="text-xs">{etichetta}</Label>
                <SceltaFp
                  voci={vociColori(perAcc)}
                  preferiti={perAcc ? undefined : pref('colore')}
                  valore={v[campo]?.fpId !== undefined ? String(v[campo]!.fpId) : null}
                  segnaposto={perAcc ? 'Cerca colore accessori (es. 9010)' : 'Cerca colore (es. 9010)'}
                  etichettaNessuno="Non indicato"
                  riserva={v[campo] ? { id: String(v[campo]!.fpId), testo: v[campo]!.descrizione } : null}
                  onScegli={x => aggiorna({ [campo]: rif(x) })}
                />
              </div>
            ))}
          </Pannello>

          <Pannello titolo="Vetri">
            {campiVetro.map((c, i) => (
              <div key={c.codice} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{c.etichetta} <span className="text-muted-foreground">(FP PRO: {c.codiceDefault})</span></Label>
                  {i === 0 && campiVetro.length > 1 && v.vetri[c.codice] && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs"
                      onClick={() => aggiorna({ vetri: Object.fromEntries(campiVetro.map(x => [x.codice, v.vetri[c.codice]])) })}>
                      Uguale per tutti
                    </Button>
                  )}
                </div>
                <SceltaFp
                  voci={vociVetri}
                  preferiti={pref('vetro')}
                  valore={v.vetri[c.codice] ? String(v.vetri[c.codice].fpId) : null}
                  segnaposto="Cerca vetro (es. 33.1)"
                  etichettaNessuno={`Come la struttura (${c.codiceDefault})`}
                  riserva={v.vetri[c.codice] ? { id: String(v.vetri[c.codice].fpId), testo: v.vetri[c.codice].codice } : null}
                  onScegli={x => {
                    const nuovi = { ...v.vetri }
                    if (x) nuovi[c.codice] = { fpId: Number(x.id), codice: x.testo }; else delete nuovi[c.codice]
                    aggiorna({ vetri: nuovi })
                  }}
                />
              </div>
            ))}
            {campi.some(c => c.tipo === 'pannello') && <p className="text-xs text-muted-foreground">I pannelli restano come nella struttura.</p>}
            {campi.length === 0 && <p className="text-xs text-muted-foreground">Questa struttura non ha vetri.</p>}
          </Pannello>

          {kit.length > 0 && (
            <Pannello titolo="Accessori">
              {kit.map(k => (
                <label key={k.chiave} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4" checked={v.kit[k.chiave] ?? k.predefinito}
                    onChange={e => aggiorna({ kit: { ...v.kit, [k.chiave]: e.target.checked } })} />
                  <span><span className="block">{k.descrizione || k.codice}</span><span className="block text-xs text-muted-foreground">{k.codice}</span></span>
                </label>
              ))}
            </Pannello>
          )}

          <Pannello titolo="Apertura e note">
            {haAnteBattenti(struttura.albero) && (
              <div className="space-y-1">
                <Label className="text-xs">Mano di apertura (anta principale)</Label>
                <div className="flex gap-2">
                  {([['sx', 'Sinistra'], ['dx', 'Destra'], [null, 'Non indicata']] as const).map(([valore, testo]) => (
                    <Button key={testo} type="button" size="sm" variant={v.mano === valore ? 'default' : 'outline'} className="flex-1" onClick={() => aggiorna({ mano: valore })}>{testo}</Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sv-note" className="text-xs">Note</Label>
              <Textarea id="sv-note" rows={3} value={voce.note} onChange={e => aggiorna({}, { note: e.target.value })} />
            </div>
          </Pannello>
        </div>
      </div>
    </div>
  )
}
