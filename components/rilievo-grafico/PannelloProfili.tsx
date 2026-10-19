'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import MiniaturaProfilo from '@/components/rilievo-fp/MiniaturaProfilo'
import { catalogoUfficio, profiliDelleSerie, type SerieCatalogo, type VetroCatalogo } from '@/actions/rilievo-grafico'
import type { Assegnazione, DisegnoGrafico, ProfiloCatalogo, RuoloPezzo } from '@/types/rilievo-grafico'
import { nomeRuolo, type DisegnoCalcolato } from '@/lib/rilievo-grafico/geometria'
import { mancanti, NOMI_MATERIALE, profiliAdatti, UTILIZZI_DOGHE, UTILIZZI_RUOLO } from '@/lib/rilievo-grafico/ruoli'

interface Props {
  calc: DisegnoCalcolato
  disegno: DisegnoGrafico
  selezione: ReadonlySet<string>
  onSelezione: (s: Set<string>) => void
  onDisegno: (d: DisegnoGrafico) => void
}

const MAX_RIGHE = 150

function RigaProfilo({ p, serie, onClick }: { p: ProfiloCatalogo; serie: string | undefined; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-accent">
      <MiniaturaProfilo anteprima={p.anteprima} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{p.codice}</span>
        <span className="block truncate text-xs text-muted-foreground">{p.descrizione ?? ''}{serie ? ` · ${serie}` : ''}</span>
      </span>
    </button>
  )
}

export default function PannelloProfili({ calc, disegno, selezione, onSelezione, onDisegno }: Props) {
  const [catalogo, setCatalogo] = useState<{ serie: SerieCatalogo[]; vetri: VetroCatalogo[]; pannelli: string[] } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [profili, setProfili] = useState<ProfiloCatalogo[] | null>(null)
  const [cercaSerie, setCercaSerie] = useState('')
  const [cerca, setCerca] = useState('')
  const [soloRuolo, setSoloRuolo] = useState(true)
  const [pannelloLibero, setPannelloLibero] = useState('')

  useEffect(() => {
    let vivo = true
    void catalogoUfficio().then(r => {
      if (!vivo) return
      if ('errore' in r) setErrore(r.errore)
      else setCatalogo(r)
    }).catch(() => vivo && setErrore('Catalogo non raggiungibile: serve la rete'))
    return () => { vivo = false }
  }, [])

  const chiaveSerie = disegno.serie.join(',')
  useEffect(() => {
    let vivo = true
    const serie = chiaveSerie ? chiaveSerie.split(',').map(Number) : []
    void profiliDelleSerie(serie).then(r => {
      if (!vivo) return
      if ('errore' in r) { setErrore(r.errore); setProfili([]) } else setProfili(r.profili)
    }).catch(() => vivo && setErrore('Profili non raggiungibili: serve la rete'))
    return () => { vivo = false }
  }, [chiaveSerie])

  const nomeSerie = useMemo(() => new Map((catalogo?.serie ?? []).map(s => [s.fpId, s.nome])), [catalogo])
  const pezziSel = calc.pezzi.filter(p => selezione.has(p.id))
  const zoneSel = calc.zone.filter(z => z.foglia && z.materiale && selezione.has(z.id))
  const ruoli = [...new Set(pezziSel.map(p => p.ruolo))]
  const materiali = [...new Set(zoneSel.map(z => z.materiale!))]
  const conta = mancanti(calc, disegno.profili, disegno.riempimenti)

  const assegnaPezzi = (a: Assegnazione | null) => {
    const profiliNuovi = { ...disegno.profili }
    for (const p of pezziSel) { if (a) profiliNuovi[p.id] = a; else delete profiliNuovi[p.id] }
    onDisegno({ ...disegno, profili: profiliNuovi })
    if (a) toast.success(`${a.codice} su ${pezziSel.length} ${pezziSel.length === 1 ? 'pezzo' : 'pezzi'}`)
  }
  const assegnaZone = (a: Omit<Assegnazione, 'materiale'> | null) => {
    const r = { ...disegno.riempimenti }
    for (const z of zoneSel) { if (a) r[z.id] = { ...a, materiale: z.materiale! }; else delete r[z.id] }
    onDisegno({ ...disegno, riempimenti: r })
    if (a) toast.success(`${a.codice} su ${zoneSel.length} ${zoneSel.length === 1 ? 'zona' : 'zone'}`)
  }

  const seleziona = (filtro: (id: string) => boolean, ids: string[]) => onSelezione(new Set(ids.filter(filtro)))
  const ruoliPresenti = [...new Set(calc.pezzi.map(p => p.ruolo))]

  // Elenco da offrire per la selezione
  const utilizzi = ruoli.length ? [...new Set(ruoli.flatMap(r => UTILIZZI_RUOLO[r]))] : null
  const elencoProfili = profili && pezziSel.length > 0 ? profiliAdatti(profili, soloRuolo ? utilizzi : null, cerca) : []
  const elencoDoghe = profili && materiali.length === 1 && (materiali[0] === 'doghe' || materiali[0] === 'lamelle')
    ? profiliAdatti(profili, soloRuolo ? UTILIZZI_DOGHE : null, cerca) : []
  const q = cerca.trim().toLowerCase()
  const elencoVetri = materiali.length === 1 && materiali[0] === 'vetro'
    ? (catalogo?.vetri ?? []).filter(v => !q || v.codice.toLowerCase().includes(q) || (v.descrizione ?? '').toLowerCase().includes(q)) : []
  const elencoPannelli = materiali.length === 1 && materiali[0] === 'pannello'
    ? (catalogo?.pannelli ?? []).filter(p => !q || p.toLowerCase().includes(q)) : []

  const serieTrovate = (catalogo?.serie ?? []).filter(s => !disegno.serie.includes(s.fpId))
    .filter(s => !cercaSerie.trim() || `${s.nome} ${s.descrizione ?? ''}`.toLowerCase().includes(cercaSerie.trim().toLowerCase()))

  return (
    <div className="space-y-4">
      {errore && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{errore}</p>}

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Serie del serramento</p>
        <div className="flex flex-wrap gap-1">
          {disegno.serie.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-sm">
              {nomeSerie.get(id) ?? `Serie ${id}`}
              <button type="button" aria-label="Togli serie" onClick={() => onDisegno({ ...disegno, serie: disegno.serie.filter(x => x !== id) })}><X className="size-3.5" /></button>
            </span>
          ))}
          {disegno.serie.length === 0 && <span className="text-sm text-muted-foreground">Nessuna: scegline una o più, si vedranno solo le loro barre.</span>}
        </div>
        <Input className="h-8" placeholder="Aggiungi serie…" value={cercaSerie} onChange={e => setCercaSerie(e.target.value)} />
        {cercaSerie.trim() && (
          <div className="max-h-40 overflow-y-auto rounded-md border">
            {serieTrovate.slice(0, 30).map(s => (
              <button key={s.fpId} type="button" className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => { onDisegno({ ...disegno, serie: [...disegno.serie, s.fpId] }); setCercaSerie('') }}>
                <b>{s.nome}</b> <span className="text-muted-foreground">{s.descrizione ?? ''}</span>
              </button>
            ))}
            {serieTrovate.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nessuna serie</p>}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm">
          Da assegnare: <b className={conta.pezzi ? 'text-red-600' : 'text-green-700'}>{conta.pezzi} pezzi</b>
          {' · '}<b className={conta.riempimenti ? 'text-red-600' : 'text-green-700'}>{conta.riempimenti} riempimenti</b>
          {conta.vuote > 0 && <span className="text-amber-700"> · {conta.vuote} zone vuote</span>}
        </p>
        <div className="flex flex-wrap gap-1">
          {ruoliPresenti.map(r => (
            <Button key={r} size="sm" variant="outline" className="h-7 px-2 text-xs"
              onClick={() => seleziona(id => calc.pezzi.find(p => p.id === id)?.ruolo === r, calc.pezzi.map(p => p.id))}>
              Tutti: {nomeRuolo(r as RuoloPezzo).toLowerCase()}
            </Button>
          ))}
          {(['vetro', 'pannello', 'doghe', 'lamelle'] as const).filter(m => calc.zone.some(z => z.foglia && z.materiale === m)).map(m => (
            <Button key={m} size="sm" variant="outline" className="h-7 px-2 text-xs"
              onClick={() => onSelezione(new Set(calc.zone.filter(z => z.foglia && z.materiale === m).map(z => z.id)))}>
              Tutti: {NOMI_MATERIALE[m].toLowerCase()}
            </Button>
          ))}
          {selezione.size > 0 && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onSelezione(new Set())}>Deseleziona</Button>}
        </div>
      </div>

      {selezione.size === 0 && <p className="text-sm text-muted-foreground">Tocca uno o più pezzi (o zone) nel disegno per assegnare la barra, il vetro o il pannello. I pezzi in rosso non hanno ancora una barra.</p>}

      {pezziSel.length > 0 && zoneSel.length > 0 && <p className="text-sm text-amber-700">Hai selezionato pezzi e zone insieme: assegna prima gli uni poi le altre.</p>}

      {pezziSel.length > 0 && zoneSel.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{pezziSel.length === 1 ? pezziSel[0].nome : `${pezziSel.length} pezzi (${ruoli.map(r => nomeRuolo(r).toLowerCase()).join(', ')})`}</p>
          <div className="flex items-center gap-2">
            <Input className="h-8 flex-1" placeholder="Cerca codice o descrizione" value={cerca} onChange={e => setCerca(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs"><Switch checked={soloRuolo} onCheckedChange={setSoloRuolo} />Solo del ruolo</label>
          </div>
          {pezziSel.some(p => disegno.profili[p.id]) && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => assegnaPezzi(null)}>Togli la barra assegnata</Button>
          )}
          {disegno.serie.length === 0 ? <p className="text-sm text-muted-foreground">Scegli prima le serie.</p>
            : profili === null ? <p className="flex items-center gap-1 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico i profili…</p>
              : (
                <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                  {elencoProfili.slice(0, MAX_RIGHE).map(p => (
                    <RigaProfilo key={p.fpId} p={p} serie={p.serieFpId !== null ? nomeSerie.get(p.serieFpId) : undefined} onClick={() => assegnaPezzi({ fpId: p.fpId, codice: p.codice, descrizione: p.descrizione })} />
                  ))}
                  {elencoProfili.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nessun profilo{soloRuolo ? ' per questo ruolo: prova a spegnere il filtro' : ''}.</p>}
                  {elencoProfili.length > MAX_RIGHE && <p className="p-2 text-xs text-muted-foreground">Altri {elencoProfili.length - MAX_RIGHE}: restringi con la ricerca.</p>}
                </div>
              )}
        </div>
      )}

      {zoneSel.length > 0 && pezziSel.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{zoneSel.length === 1 ? `Zona Z${zoneSel[0].numero}` : `${zoneSel.length} zone`} · {materiali.map(m => NOMI_MATERIALE[m]).join(', ')}</p>
          {materiali.length > 1 ? <p className="text-sm text-amber-700">Zone con riempimenti diversi: selezionane di un tipo solo.</p> : (
            <>
              <div className="flex items-center gap-2">
                <Input className="h-8 flex-1" placeholder="Cerca" value={cerca} onChange={e => setCerca(e.target.value)} />
                {(materiali[0] === 'doghe' || materiali[0] === 'lamelle') && (
                  <label className="flex items-center gap-1.5 text-xs"><Switch checked={soloRuolo} onCheckedChange={setSoloRuolo} />Solo doghe</label>
                )}
              </div>
              {zoneSel.some(z => disegno.riempimenti[z.id]) && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => assegnaZone(null)}>Togli l&apos;assegnazione</Button>
              )}
              <div className="max-h-[50vh] overflow-y-auto rounded-md border">
                {materiali[0] === 'vetro' && elencoVetri.slice(0, MAX_RIGHE).map(v => (
                  <button key={v.fpId} type="button" className="block w-full px-2 py-1 text-left hover:bg-accent"
                    onClick={() => assegnaZone({ fpId: v.fpId, codice: v.codice, descrizione: v.descrizione })}>
                    <span className="block text-sm font-medium">{v.codice}{v.spessore ? <span className="font-normal text-muted-foreground"> · {v.spessore} mm</span> : null}</span>
                    <span className="block truncate text-xs text-muted-foreground">{v.descrizione ?? ''}</span>
                  </button>
                ))}
                {materiali[0] === 'pannello' && (
                  <>
                    {elencoPannelli.map(p => (
                      <button key={p} type="button" className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => assegnaZone({ fpId: null, codice: p, descrizione: 'Pannello FP PRO' })}>{p}</button>
                    ))}
                    <div className="flex gap-1 border-t p-1.5">
                      <Input className="h-8" placeholder="Altro pannello (es. 24MM)" value={pannelloLibero} onChange={e => setPannelloLibero(e.target.value)} />
                      <Button size="sm" disabled={!pannelloLibero.trim()} onClick={() => { assegnaZone({ fpId: null, codice: pannelloLibero.trim().toUpperCase(), descrizione: null }); setPannelloLibero('') }}>Usa</Button>
                    </div>
                  </>
                )}
                {(materiali[0] === 'doghe' || materiali[0] === 'lamelle') && (disegno.serie.length === 0
                  ? <p className="p-2 text-sm text-muted-foreground">Scegli prima le serie.</p>
                  : elencoDoghe.slice(0, MAX_RIGHE).map(p => (
                    <RigaProfilo key={p.fpId} p={p} serie={p.serieFpId !== null ? nomeSerie.get(p.serieFpId) : undefined} onClick={() => assegnaZone({ fpId: p.fpId, codice: p.codice, descrizione: p.descrizione })} />
                  )))}
                {!catalogo && !errore && <p className="flex items-center gap-1 p-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
