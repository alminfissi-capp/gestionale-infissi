'use client'

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/db'
import { salvaVoceLocale } from '@/lib/rilievo-fp-locale'
import {
  campiRiempimento, divisioniStruttura, haAnteBattenti, kitOpzionali, nuovaVoceFp, problemiVoce, telaiStruttura,
} from '@/lib/fppro/rilievo-fp'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import ListaConRicerca from './ListaConRicerca'
import SceltaTipologia from './SceltaTipologia'
import type { Lato, StrutturaLocale, VoceFp, VoceFpDati } from '@/types/rilievo-fp'

const PASSI = ['Serie', 'Tipologia', 'Misure', 'Finitura', 'Vetri', 'Opzioni', 'Telaio', 'Note'] as const
const LATI: Lato[] = ['sinistra', 'alto', 'destra', 'basso']

interface Props {
  rilievoId: string
  voceId: string | null
  onFine: () => void
}

const numero = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
}

export default function WizardVoce({ rilievoId, voceId, onFine }: Props) {
  const esistente = useLiveQuery(() => (voceId ? db.vociFp.get(voceId) : undefined), [voceId])
  const [bozza, setBozza] = useState<VoceFp | null>(null)
  const voce = bozza ?? esistente ?? null
  const [passo, setPasso] = useState(voceId ? 2 : 0)
  const [serie, setSerie] = useState<string | null>(null)

  const struttura = useLiveQuery(() => (voce ? db.fpStrutture.get(voce.fp.strutturaId) : undefined), [voce?.fp.strutturaId])
  const elencoSerie = useLiveQuery(() => db.fpSerie.orderBy('nome').filter(s => s.presente).toArray(), [], [])
  const serieRecenti = useLiveQuery(async () => {
    const v = await db.vociFp.orderBy('aggiornatoAt').reverse().limit(100).toArray()
    return [...new Set(v.map(x => x.fp.serie))].slice(0, 5)
  }, [], [] as string[])
  const colori = useLiveQuery(() => db.fpColori.filter(c => c.presente).toArray(), [], [])
  const vetri = useLiveQuery(() => db.fpVetri.filter(v => v.presente).toArray(), [], [])
  const preferenze = useLiveQuery(() => db.fpPreferenze.toArray(), [], [])
  const serieFp = useLiveQuery(() => (voce ? db.fpSerie.where('nome').equals(voce.fp.serie).first() : undefined), [voce?.fp.serie])
  const telaiSerie = useLiveQuery(
    () => (serieFp ? db.fpTelai.where('serie_fp_id').equals(serieFp.fp_id).filter(t => t.presente).toArray() : []),
    [serieFp?.fp_id], [],
  )

  const pref = (tipo: 'colore' | 'vetro') => new Set(preferenze.filter(p => p.tipo === tipo).map(p => Number(p.rif)))
  const divisioni = useMemo(() => (struttura ? divisioniStruttura(struttura.albero) : []), [struttura])
  const campi = useMemo(() => (struttura ? campiRiempimento(struttura.albero) : []), [struttura])
  const kit = useMemo(() => (struttura ? kitOpzionali(struttura.albero) : []), [struttura])
  const telaiDefault = useMemo(() => (struttura ? telaiStruttura(struttura.albero) : {}), [struttura])

  const aggiorna = (patch: Partial<VoceFpDati>, altro: Partial<VoceFp> = {}) => {
    if (!voce) return
    setBozza({ ...voce, ...altro, fp: { ...voce.fp, ...patch } })
  }

  const salva = async (prossimo: number | 'fine') => {
    if (voce) await salvaVoceLocale(voce)
    if (prossimo === 'fine') { toast.success('Voce salvata'); onFine() } else setPasso(prossimo)
  }

  const sceltaStruttura = async (s: StrutturaLocale) => {
    const ordine = await db.vociFp.where('rilievoId').equals(rilievoId).count()
    const nuova: VoceFp = {
      id: voce?.id ?? crypto.randomUUID(),
      rilievoId,
      ordine: voce?.ordine ?? ordine,
      posizione: voce?.posizione ?? '',
      quantita: voce?.quantita ?? 1,
      note: voce?.note ?? '',
      fp: { ...nuovaVoceFp(s, serie ?? voce?.fp.serie ?? s.serie[0]), larghezza: voce?.fp.larghezza ?? null, altezza: voce?.fp.altezza ?? null },
      aggiornatoAt: new Date().toISOString(),
    }
    setBozza(nuova)
    await salvaVoceLocale(nuova)
    setPasso(2)
  }

  const testa = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onFine}>Chiudi</Button>
      <span className="text-sm text-muted-foreground">{passo + 1}/{PASSI.length} · {PASSI[passo]}</span>
    </div>
  )
  const piede = (
    <div className="sticky bottom-0 flex gap-2 bg-background py-3">
      {passo > 0 && <Button variant="outline" className="flex-1 h-12" onClick={() => salva(passo - 1)}>Indietro</Button>}
      {passo >= 2 && passo < PASSI.length - 1 && <Button className="flex-1 h-12" onClick={() => salva(passo + 1)}>Avanti</Button>}
      {passo === PASSI.length - 1 && <Button className="flex-1 h-12" onClick={() => salva('fine')}>Salva voce</Button>}
    </div>
  )

  if (passo === 0) {
    const ordinate = [...elencoSerie].sort((a, b) => Number(serieRecenti.includes(b.nome)) - Number(serieRecenti.includes(a.nome)))
    return (
      <div className="space-y-3">{testa}
        <ul className="divide-y rounded-md border">
          {ordinate.map(s => (
            <li key={s.fp_id}>
              <button type="button" className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-muted" onClick={() => { setSerie(s.nome); setPasso(1) }}>
                <span className="text-sm font-medium">{s.nome}</span>
                <span className="text-xs text-muted-foreground">{s.descrizione}{serieRecenti.includes(s.nome) ? ' · recente' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (passo === 1) {
    return <div className="space-y-3">{testa}<SceltaTipologia serie={serie ?? voce?.fp.serie ?? ''} onScegli={sceltaStruttura} />{piede}</div>
  }

  if (!voce || !struttura) return <div className="space-y-3">{testa}<p className="text-sm text-muted-foreground">Caricamento…</p></div>
  const v = voce.fp
  const problemi = problemiVoce(v, divisioni)

  return (
    <div className="space-y-4">
      {testa}
      <div className="rounded-md border bg-white p-2">
        <DisegnoVoceSvg struttura={struttura} voce={v} className="mx-auto h-48 w-full" />
        <p className="mt-1 text-center text-xs text-muted-foreground">{v.serie} · {v.nome}</p>
      </div>

      {passo === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="pos">Posizione / locale</Label><Input id="pos" value={voce.posizione} onChange={e => aggiorna({}, { posizione: e.target.value })} /></div>
          <div><Label htmlFor="l">Larghezza (mm)</Label><Input id="l" inputMode="numeric" value={v.larghezza ?? ''} onChange={e => aggiorna({ larghezza: numero(e.target.value) })} /></div>
          <div><Label htmlFor="h">Altezza (mm)</Label><Input id="h" inputMode="numeric" value={v.altezza ?? ''} onChange={e => aggiorna({ altezza: numero(e.target.value) })} /></div>
          <div><Label htmlFor="q">Quantità</Label><Input id="q" inputMode="numeric" value={voce.quantita} onChange={e => aggiorna({}, { quantita: Math.max(1, numero(e.target.value) ?? 1) })} /></div>
          {divisioni.map(d => {
            const totale = d.tipo === 'traverso' ? (v.altezza ?? struttura.h_nominale) : (v.larghezza ?? struttura.l_nominale)
            const nominaleTot = d.tipo === 'traverso' ? struttura.h_nominale : struttura.l_nominale
            const proporzionale = totale && nominaleTot ? Math.round((d.nominale * totale) / nominaleTot) : null
            return (
              <div key={d.codice}>
                <Label htmlFor={`d${d.codice}`}>{d.etichetta} {d.tipo === 'traverso' ? '(dal basso)' : '(da sinistra)'}</Label>
                <Input id={`d${d.codice}`} inputMode="numeric" placeholder={proporzionale ? `≈ ${proporzionale}` : ''} value={v.quote[d.codice] ?? ''}
                  onChange={e => {
                    const n = numero(e.target.value)
                    const quote = { ...v.quote }
                    if (n === null) delete quote[d.codice]; else quote[d.codice] = n
                    aggiorna({ quote })
                  }} />
              </div>
            )
          })}
          {problemi.length > 0 && <ul className="col-span-2 text-sm text-amber-700">{problemi.map(p => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-4">
          {(['coloreInt', 'coloreEst'] as const).map(campo => (
            <div key={campo} className="space-y-1">
              <Label>{campo === 'coloreInt' ? 'Colore interno' : 'Colore esterno'}</Label>
              <ListaConRicerca
                elementi={colori.map(c => ({ id: c.fp_id, testo: c.descrizione }))}
                preferiti={pref('colore')}
                valore={v[campo]?.fpId ?? null}
                segnaposto="Cerca colore (es. 9010)"
                onScegli={e => aggiorna({ [campo]: e ? { fpId: e.id, descrizione: e.testo } : null })}
              />
            </div>
          ))}
        </div>
      )}

      {passo === 4 && (
        <div className="space-y-4">
          {campi.filter(c => c.tipo === 'vetro').map((c, i) => (
            <div key={c.codice} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{c.etichetta} <span className="text-xs text-muted-foreground">(FP PRO: {c.codiceDefault})</span></Label>
                {i === 0 && campi.filter(x => x.tipo === 'vetro').length > 1 && v.vetri[c.codice] && (
                  <Button variant="link" size="sm" onClick={() => aggiorna({ vetri: Object.fromEntries(campi.filter(x => x.tipo === 'vetro').map(x => [x.codice, v.vetri[c.codice]])) })}>Uguale per tutti</Button>
                )}
              </div>
              <ListaConRicerca
                elementi={vetri.map(x => ({ id: x.fp_id, testo: x.codice, sotto: x.descrizione }))}
                preferiti={pref('vetro')}
                valore={v.vetri[c.codice]?.fpId ?? null}
                segnaposto="Cerca vetro (es. 33.1)"
                etichettaNessuno={`Come la struttura (${c.codiceDefault})`}
                onScegli={e => {
                  const vetriNuovi = { ...v.vetri }
                  if (e) vetriNuovi[c.codice] = { fpId: e.id, codice: e.testo }; else delete vetriNuovi[c.codice]
                  aggiorna({ vetri: vetriNuovi })
                }}
              />
            </div>
          ))}
          {campi.some(c => c.tipo === 'pannello') && <p className="text-xs text-muted-foreground">I pannelli restano come nella struttura.</p>}
          {campi.length === 0 && <p className="text-sm text-muted-foreground">Questa struttura non ha vetri.</p>}
        </div>
      )}

      {passo === 5 && (
        <div className="space-y-4">
          {kit.length === 0 && <p className="text-sm text-muted-foreground">Nessuna opzione da scegliere.</p>}
          {kit.map(k => (
            <label key={k.chiave} className="flex items-start gap-3 rounded-md border p-3">
              <input type="checkbox" className="mt-1 size-5" checked={v.kit[k.chiave] ?? k.predefinito} onChange={e => aggiorna({ kit: { ...v.kit, [k.chiave]: e.target.checked } })} />
              <span><span className="block text-sm">{k.descrizione || k.codice}</span><span className="block text-xs text-muted-foreground">{k.codice}</span></span>
            </label>
          ))}
          {haAnteBattenti(struttura.albero) && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Mano di apertura (anta principale)</legend>
              <div className="flex gap-2">
                {([['sx', 'Sinistra'], ['dx', 'Destra'], [null, 'Non indicata']] as const).map(([valore, testo]) => (
                  <Button key={testo} type="button" variant={v.mano === valore ? 'default' : 'outline'} className="flex-1 h-11" onClick={() => aggiorna({ mano: valore })}>{testo}</Button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {passo === 6 && (
        <div className="space-y-3">
          {LATI.filter(l => telaiDefault[l]).map(l => (
            <div key={l} className="space-y-1">
              <Label htmlFor={`t-${l}`}>Telaio {l}</Label>
              <select id={`t-${l}`} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={v.telai[l] ?? ''}
                onChange={e => { const telai = { ...v.telai }; if (e.target.value) telai[l] = e.target.value; else delete telai[l]; aggiorna({ telai }) }}>
                <option value="">Come la struttura ({telaiDefault[l]})</option>
                {telaiSerie.map(t => <option key={t.fp_id} value={t.codice}>{t.codice} — {t.descrizione}</option>)}
              </select>
            </div>
          ))}
          {Object.keys(telaiDefault).length === 0 && <p className="text-sm text-muted-foreground">Nessun telaio da scegliere.</p>}
        </div>
      )}

      {passo === 7 && (
        <div className="space-y-1">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" rows={4} value={voce.note} onChange={e => aggiorna({}, { note: e.target.value })} />
        </div>
      )}

      {piede}
    </div>
  )
}
