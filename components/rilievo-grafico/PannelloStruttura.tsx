'use client'

import { useState } from 'react'
import { Columns2, Grid3x3, Rows2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Apertura, Materiale, PosizioneTagli, Verso, Zona } from '@/types/rilievo-grafico'
import type { DisegnoCalcolato } from '@/lib/rilievo-grafico/geometria'
import { ingombro } from '@/lib/rilievo-grafico/forma'
import {
  aggiornaAnta, dividi, eliminaElemento, eliminaTaglio, griglia, impostaPosizione, mettiAnta, riempi, trovaZona, zonaDiElemento,
} from '@/lib/rilievo-grafico/modifiche'
import { NOMI_MATERIALE } from '@/lib/rilievo-grafico/ruoli'

/** Cosa e' selezionato nel disegno della struttura */
export type SelezioneStruttura = { tipo: 'zona'; id: string } | { tipo: 'pezzo'; id: string } | null

interface Props {
  calc: DisegnoCalcolato
  radice: Zona
  selezione: SelezioneStruttura
  onRadice: (r: Zona, nuovaSelezione?: SelezioneStruttura) => void
}

const APERTURE: { v: Apertura; nome: string }[] = [
  { v: 'battente', nome: 'Battente' }, { v: 'anta_ribalta', nome: 'Anta-ribalta' },
  { v: 'ribalta', nome: 'Ribalta (vasistas)' }, { v: 'scorrevole', nome: 'Scorrevole' },
]
const MATERIALI: Materiale[] = ['vetro', 'pannello', 'doghe', 'lamelle']

const numero = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null }

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</p>
      {children}
    </div>
  )
}

/** Montante o traverso nuovo: a meta', parti uguali o a quota */
function NuovaDivisione({ verso, onCrea }: { verso: Verso; onCrea: (p: PosizioneTagli, parti: number) => void }) {
  const [modo, setModo] = useState<'meta' | 'uguali' | 'quota'>('meta')
  const [parti, setParti] = useState('3')
  const [quota, setQuota] = useState('')
  const [da, setDa] = useState<'inizio' | 'fine'>('inizio')
  const [inizio, fine] = verso === 'montante' ? ['da sinistra', 'da destra'] : ['dal basso', "dall'alto"]
  const crea = () => {
    if (modo === 'meta') return onCrea({ modo: 'uguali' }, 2)
    if (modo === 'uguali') { const n = Math.round(numero(parti) ?? 0); if (n >= 2) onCrea({ modo: 'uguali' }, n); return }
    const q = numero(quota)
    if (q && q > 0) onCrea({ modo: 'quote', da, quote: [q] }, 2)
  }
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex flex-wrap gap-1">
        {(['meta', 'uguali', 'quota'] as const).map(m => (
          <Button key={m} size="sm" variant={modo === m ? 'default' : 'outline'} onClick={() => setModo(m)}>
            {m === 'meta' ? 'A metà' : m === 'uguali' ? 'Parti uguali' : 'A quota'}
          </Button>
        ))}
      </div>
      {modo === 'uguali' && (
        <label className="flex items-center gap-2 text-sm">Parti <Input className="h-8 w-16" inputMode="numeric" value={parti} onChange={e => setParti(e.target.value)} /></label>
      )}
      {modo === 'quota' && (
        <div className="flex items-center gap-1.5">
          <Input className="h-8 w-24" inputMode="decimal" placeholder="mm" value={quota} onChange={e => setQuota(e.target.value)} autoFocus />
          <Button size="sm" variant={da === 'inizio' ? 'secondary' : 'ghost'} onClick={() => setDa('inizio')}>{inizio}</Button>
          <Button size="sm" variant={da === 'fine' ? 'secondary' : 'ghost'} onClick={() => setDa('fine')}>{fine}</Button>
        </div>
      )}
      <Button size="sm" className="w-full" onClick={crea}>Inserisci {verso}</Button>
    </div>
  )
}

export default function PannelloStruttura({ calc, radice, selezione, onRadice }: Props) {
  const [aperto, setAperto] = useState<'montante' | 'traverso' | 'griglia' | null>(null)
  const [colonne, setColonne] = useState('3')
  const [righe, setRighe] = useState('2')
  const [passanti, setPassanti] = useState<Verso>('montante')
  const [quotaTesto, setQuotaTesto] = useState<string | null>(null)

  if (!selezione) {
    return (
      <p className="text-sm text-muted-foreground">
        Tocca una zona per dividerla con montanti e traversi, metterci un&apos;anta o scegliere il riempimento.
        Con <b>Traccia</b> attivo disegna col dito una riga da un lato all&apos;altro della zona: diventa un montante o un traverso.
      </p>
    )
  }

  if (selezione.tipo === 'zona') {
    const z = trovaZona(radice, selezione.id)
    const zc = calc.zone.find(x => x.id === selezione.id)
    if (!z || !zc) return null
    const b = ingombro(zc.poligono.p)
    const c = z.contenuto
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold">Zona Z{zc.numero} <span className="font-normal text-muted-foreground">· {Math.round(b.maxX - b.minX)} × {Math.round(b.maxY - b.minY)} mm (all&apos;asse)</span></p>
        <Gruppo titolo="Dividi">
          <div className="grid grid-cols-3 gap-1">
            <Button size="sm" variant={aperto === 'montante' ? 'default' : 'outline'} className="gap-1" onClick={() => setAperto(a => (a === 'montante' ? null : 'montante'))}><Columns2 className="size-4" />Montante</Button>
            <Button size="sm" variant={aperto === 'traverso' ? 'default' : 'outline'} className="gap-1" onClick={() => setAperto(a => (a === 'traverso' ? null : 'traverso'))}><Rows2 className="size-4" />Traverso</Button>
            <Button size="sm" variant={aperto === 'griglia' ? 'default' : 'outline'} className="gap-1" onClick={() => setAperto(a => (a === 'griglia' ? null : 'griglia'))}><Grid3x3 className="size-4" />Griglia</Button>
          </div>
          {(aperto === 'montante' || aperto === 'traverso') && (
            <NuovaDivisione verso={aperto} onCrea={(p, n) => { onRadice(dividi(radice, z.id, aperto, p, n), null); setAperto(null) }} />
          )}
          {aperto === 'griglia' && (
            <div className="space-y-1.5 rounded-md border p-2">
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1">Colonne <Input className="h-8 w-14" inputMode="numeric" value={colonne} onChange={e => setColonne(e.target.value)} /></label>
                <label className="flex items-center gap-1">Righe <Input className="h-8 w-14" inputMode="numeric" value={righe} onChange={e => setRighe(e.target.value)} /></label>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">Passanti:</span>
                <Button size="sm" variant={passanti === 'montante' ? 'secondary' : 'ghost'} onClick={() => setPassanti('montante')}>montanti</Button>
                <Button size="sm" variant={passanti === 'traverso' ? 'secondary' : 'ghost'} onClick={() => setPassanti('traverso')}>traversi</Button>
              </div>
              <Button size="sm" className="w-full" onClick={() => {
                const cc = Math.max(1, Math.min(20, Math.round(numero(colonne) ?? 1))), rr = Math.max(1, Math.min(20, Math.round(numero(righe) ?? 1)))
                if (cc * rr < 2) return
                onRadice(griglia(radice, z.id, cc, rr, passanti), null)
                setAperto(null)
              }}>Crea griglia</Button>
            </div>
          )}
        </Gruppo>
        <Gruppo titolo="Apertura">
          <div className="grid grid-cols-2 gap-1">
            {APERTURE.map(a => (
              <Button key={a.v} size="sm" variant="outline" onClick={() => onRadice(mettiAnta(radice, z.id, a.v, a.v === 'scorrevole' ? 2 : 1, a.v === 'scorrevole' || a.v === 'ribalta' ? null : 'sx'), null)}>
                {a.nome}
              </Button>
            ))}
          </div>
        </Gruppo>
        <Gruppo titolo="Riempimento">
          <div className="grid grid-cols-3 gap-1">
            {MATERIALI.map(m => (
              <Button key={m} size="sm" variant={c.tipo === 'riempimento' && c.materiale === m ? 'default' : 'outline'} onClick={() => onRadice(riempi(radice, z.id, m), selezione)}>
                {NOMI_MATERIALE[m]}
              </Button>
            ))}
            <Button size="sm" variant={c.tipo === 'vuoto' ? 'default' : 'outline'} onClick={() => onRadice(riempi(radice, z.id, null), selezione)}>Vuota</Button>
          </div>
        </Gruppo>
      </div>
    )
  }

  // Pezzo selezionato
  const p = calc.pezzi.find(x => x.id === selezione.id)
  if (!p) return null
  if (p.ruolo === 'telaio') {
    return <p className="text-sm"><b>{p.nome}</b> — la forma del telaio si cambia nel riquadro <b>Forma esterna</b>.</p>
  }

  if (p.ruolo === 'montante' || p.ruolo === 'traverso') {
    const zona = zonaDiElemento(radice, p.elemento)
    if (!zona || zona.contenuto.tipo !== 'divisione') return null
    const div = zona.contenuto
    const indice = Number(p.id.split('#')[1])
    const quote = calc.quote.filter(q => q.id.startsWith(`${div.id}#`)).sort((a, b) => Number(a.id.split('#')[1]) - Number(b.id.split('#')[1]))
    const zc = calc.zone.find(x => x.id === zona.id)
    const b = zc ? ingombro(zc.poligono.p) : null
    const [inizio, fine] = p.ruolo === 'montante' ? [b?.minX ?? 0, b?.maxX ?? 0] : [b?.minY ?? 0, b?.maxY ?? 0]
    // Posizioni attuali dall'inizio della zona: per passare da "uguali" a quote
    const attuali = quote.map(q => (q.da === 'inizio' ? q.valore : fine - inizio - q.valore))
    const da = div.posizione.modo === 'quote' ? div.posizione.da : 'inizio'
    const valore = quote[indice]?.valore ?? 0
    const [nomeInizio, nomeFine] = p.ruolo === 'montante' ? ['da sinistra', 'da destra'] : ['dal basso', "dall'alto"]
    const scriviQuota = (v: number) => {
      const nuove = attuali.map(x => (da === 'inizio' ? x : fine - inizio - x))
      nuove[indice] = v
      onRadice(impostaPosizione(radice, div.id, { modo: 'quote', da, quote: nuove }), selezione)
    }
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold">{p.nome} <span className="font-normal text-muted-foreground">· lungo {Math.round(p.lunghezza)} mm all&apos;asse</span></p>
        <Gruppo titolo="Posizione (all'asse)">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={div.posizione.modo === 'uguali' ? 'default' : 'outline'}
              onClick={() => onRadice(impostaPosizione(radice, div.id, { modo: 'uguali' }), selezione)}>
              {div.parti.length === 2 ? 'A metà' : `${div.parti.length} parti uguali`}
            </Button>
            <Button size="sm" variant={div.posizione.modo === 'quote' && da === 'inizio' ? 'default' : 'outline'}
              onClick={() => onRadice(impostaPosizione(radice, div.id, { modo: 'quote', da: 'inizio', quote: attuali }), selezione)}>
              {nomeInizio}
            </Button>
            <Button size="sm" variant={div.posizione.modo === 'quote' && da === 'fine' ? 'default' : 'outline'}
              onClick={() => onRadice(impostaPosizione(radice, div.id, { modo: 'quote', da: 'fine', quote: attuali.map(x => fine - inizio - x) }), selezione)}>
              {nomeFine}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Quota {da === 'inizio' ? nomeInizio : nomeFine}
            <Input key={`${p.id}-${da}`} className="h-8 w-24 text-right" inputMode="decimal"
              value={quotaTesto ?? String(valore)}
              onChange={e => { setQuotaTesto(e.target.value); const n = numero(e.target.value); if (n && n > 0 && n < fine - inizio) scriviQuota(n) }}
              onBlur={() => setQuotaTesto(null)} />
            mm
          </label>
        </Gruppo>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => onRadice(eliminaTaglio(radice, div.id, indice, attuali.map(x => (da === 'inizio' ? x : fine - inizio - x))), null)}>
            <Trash2 className="size-4" />Togli questo {p.ruolo}
          </Button>
          {div.parti.length > 2 && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onRadice(eliminaElemento(radice, div.id), null)}>
              <Trash2 className="size-4" />Togli tutti ({div.parti.length - 1})
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (p.ruolo === 'anta' || p.ruolo === 'anta_scorrevole' || p.ruolo === 'riporto') {
    const zona = zonaDiElemento(radice, p.elemento)
    if (!zona || zona.contenuto.tipo !== 'anta') return null
    const a = zona.contenuto
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold">{p.nome}</p>
        <Gruppo titolo="Apertura">
          <div className="grid grid-cols-2 gap-1">
            {APERTURE.map(x => (
              <Button key={x.v} size="sm" variant={a.apertura === x.v ? 'default' : 'outline'} onClick={() => onRadice(aggiornaAnta(radice, a.id, { apertura: x.v }), selezione)}>{x.nome}</Button>
            ))}
          </div>
        </Gruppo>
        <Gruppo titolo="Numero di ante">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(n => (
              <Button key={n} size="sm" variant={a.ante.length === n ? 'default' : 'outline'} onClick={() => onRadice(aggiornaAnta(radice, a.id, { numero: n }), null)}>{n}</Button>
            ))}
          </div>
        </Gruppo>
        {a.apertura !== 'scorrevole' && a.apertura !== 'ribalta' && (
          <Gruppo titolo="Mano (anta principale)">
            <div className="flex gap-1">
              <Button size="sm" variant={a.mano !== 'dx' ? 'default' : 'outline'} onClick={() => onRadice(aggiornaAnta(radice, a.id, { mano: 'sx' }), selezione)}>Cerniere a sinistra</Button>
              <Button size="sm" variant={a.mano === 'dx' ? 'default' : 'outline'} onClick={() => onRadice(aggiornaAnta(radice, a.id, { mano: 'dx' }), selezione)}>Cerniere a destra</Button>
            </div>
          </Gruppo>
        )}
        <Button size="sm" variant="outline" className="gap-1" onClick={() => onRadice(eliminaElemento(radice, a.id), null)}>
          <Trash2 className="size-4" />Togli l&apos;anta
        </Button>
      </div>
    )
  }

  // Fermavetro / fermapannello: si governano dal riempimento della zona
  return <p className="text-sm"><b>{p.nome}</b> — segue il riempimento della zona: tocca il centro della zona per cambiarlo.</p>
}
