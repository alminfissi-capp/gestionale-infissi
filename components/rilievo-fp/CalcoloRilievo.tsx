'use client'

// Calcolo del rilievo in ufficio: profilo di calcolo di FP PRO, prezzo di ogni voce come lo
// calcola FP PRO, correzioni per riga e trasferimento in Preventivi.
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/pricing'
import {
  calcolaRilievoFp, salvaCorrezioniVoce, trasferisciInPreventivi,
  type CalcoloRilievo as Calcolo, type DatiPaginaCalcolo, type VoceCalcolata,
} from '@/actions/calcolo-fp'
import type { CorrezioniVoce, OreVoce } from '@/lib/fppro/calcolo/tipi'
import { campiOre, oreDaSalvare } from '@/lib/fppro/calcolo/correzioni'
import { nomeCliente } from './ElencoRilievi'

const ORE: { chiave: keyof OreVoce; etichetta: string }[] = [
  { chiave: 'taglio', etichetta: 'Taglio' },
  { chiave: 'lavorazione', etichetta: 'Lavorazione' },
  { chiave: 'montaggio', etichetta: 'Montaggio' },
  { chiave: 'assemblaggio', etichetta: 'Assemblaggio' },
  { chiave: 'posa', etichetta: 'Posa' },
]
const PERCENTUALI = [
  { chiave: 'spese_generali', etichetta: 'Spese generali' },
  { chiave: 'utile', etichetta: 'Utile' },
  { chiave: 'provvigione', etichetta: 'Provvigione' },
  { chiave: 'imballo', etichetta: 'Imballo' },
  { chiave: 'viaggio', etichetta: 'Viaggio' },
  { chiave: 'materiali_vari', etichetta: 'Materiali vari' },
  { chiave: 'altro', etichetta: 'Altro' },
] as const
const GRUPPI = { profili: 'Profili', accessori: 'Accessori', vetri: 'Vetri', pannelli: 'Pannelli' } as const

const oreTotali = (o: OreVoce) => o.taglio + o.lavorazione + o.montaggio + o.assemblaggio + o.posa
const numero = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Pannello delle correzioni di una voce. Le ore partono da quelle usate nel calcolo (struttura
 * + correzioni): si vede e si cambia il valore vero. Percentuali vuote = profilo di calcolo.
 */
function Correzioni({ iniziali, oreAttuali, onSalva, inCorso }: {
  iniziali: CorrezioniVoce; oreAttuali: OreVoce; onSalva: (c: CorrezioniVoce) => void; inCorso: boolean
}) {
  const [ore, setOre] = useState<Record<string, string>>(() => campiOre(oreAttuali))
  const [perc, setPerc] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(iniziali.percentuali ?? {}).map(([k, v]) => [k, String(Math.round((v ?? 0) * 10000) / 100)])))
  // Importi come testo: si possono scrivere i decimali ("12,50") e lasciare il campo vuoto.
  const [extra, setExtra] = useState((iniziali.extra ?? []).map(e => ({ descrizione: e.descrizione, importo: String(e.importo) })))

  const salva = () => {
    const c: CorrezioniVoce = {
      ore: {}, percentuali: {},
      extra: extra.map(e => ({ descrizione: e.descrizione.trim(), importo: numero(e.importo) ?? 0 })).filter(e => e.descrizione || e.importo),
    }
    c.ore = oreDaSalvare(ore, oreAttuali, iniziali.ore ?? {})
    for (const { chiave } of PERCENTUALI) {
      const v = numero(perc[chiave] ?? '')
      if ((perc[chiave] ?? '').trim() !== '' && v !== null) c.percentuali![chiave] = v / 100
    }
    onSalva(c)
  }

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
      <p className="text-xs text-muted-foreground">Le correzioni valgono solo per questa voce.</p>
      <div>
        <p className="mb-1 font-medium">Ore per pezzo</p>
        <p className="mb-1 text-xs text-muted-foreground">Sono le ore usate ora nel calcolo (quelle della struttura di FP PRO, se non le hai cambiate). Scrivi il valore giusto: sostituisce, non si somma.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ORE.map(o => (
            <label key={o.chiave} className="text-xs">{o.etichetta}
              <Input inputMode="decimal" value={ore[o.chiave] ?? ''} onChange={e => setOre({ ...ore, [o.chiave]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 font-medium">Percentuali (%)</p>
        <p className="mb-1 text-xs text-muted-foreground">Vuoto = valore del profilo di calcolo.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERCENTUALI.map(p => (
            <label key={p.chiave} className="text-xs">{p.etichetta}
              <Input inputMode="decimal" value={perc[p.chiave] ?? ''} onChange={e => setPerc({ ...perc, [p.chiave]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 font-medium">Extra fissi per pezzo (€)</p>
        {extra.map((e, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <Input placeholder="Descrizione" value={e.descrizione} onChange={ev => setExtra(extra.map((x, j) => (j === i ? { ...x, descrizione: ev.target.value } : x)))} />
            <Input className="w-28" inputMode="decimal" value={e.importo} onChange={ev => setExtra(extra.map((x, j) => (j === i ? { ...x, importo: ev.target.value } : x)))} />
            <Button variant="ghost" size="icon" aria-label="Togli extra" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setExtra([...extra, { descrizione: '', importo: '' }])}><Plus className="mr-1 size-4" />Extra</Button>
      </div>
      <Button onClick={salva} disabled={inCorso}>{inCorso && <Loader2 className="mr-2 size-4 animate-spin" />}Salva e ricalcola</Button>
    </div>
  )
}

function DettaglioMateriali({ voce }: { voce: VoceCalcolata }) {
  const c = voce.calcolo
  return (
    <div className="space-y-2 text-xs">
      {(Object.keys(GRUPPI) as (keyof typeof GRUPPI)[]).map(g => {
        const righe = c.righe.filter(r => r.gruppo === g)
        if (righe.length === 0) return null
        return (
          <div key={g}>
            <p className="font-medium">{GRUPPI[g]} · {formatEuro(righe.reduce((s, r) => s + r.costo, 0))}</p>
            <ul className="text-muted-foreground">
              {righe.map((r, i) => (
                <li key={i}>{r.codice} — {r.quantita} {r.unita}{r.descrizione ? ` (${r.descrizione})` : ''} · {formatEuro(r.costo)}</li>
              ))}
            </ul>
          </div>
        )
      })}
      <p>Lavoro: {oreTotali(c.ore).toFixed(2)} h · {formatEuro(c.prezzo.costoLavoro)} — Costo industriale {formatEuro(c.prezzo.costoIndustriale)}
        {' '}— Utile {formatEuro(c.prezzo.utile)} — Provvigione {formatEuro(c.prezzo.provvigione)} — Spese varie {formatEuro(c.prezzo.speseVarie)}</p>
    </div>
  )
}

export default function CalcoloRilievo({ rilievoId, dati }: { rilievoId: string; dati: DatiPaginaCalcolo }) {
  const router = useRouter()
  const predefinito = dati.configPrevFpId ?? dati.profili.find(p => p.nome === 'ALM2026')?.fpId ?? dati.profili[0]?.fpId ?? null
  const [configId, setConfigId] = useState<number | null>(predefinito)
  const [calcolo, setCalcolo] = useState<Calcolo | null>(dati.calcolo)
  const [correzioni, setCorrezioni] = useState(dati.correzioni)
  const [aperta, setAperta] = useState<string | null>(null)
  const [dettaglio, setDettaglio] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<'calcolo' | 'trasferimento' | null>(null)
  const [superato, setSuperato] = useState<string | null>(dati.superato)

  const calcola = async () => {
    if (configId === null) return
    setInCorso('calcolo')
    try {
      const r = await calcolaRilievoFp(rilievoId, configId)
      if ('errore' in r) toast.error(r.errore)
      else {
        setCalcolo(r.calcolo)
        setSuperato(null)
      }
    } finally {
      setInCorso(null)
    }
  }

  const salvaCorrezioni = async (voceId: string, c: CorrezioniVoce) => {
    setInCorso('calcolo')
    const r = await salvaCorrezioniVoce(voceId, c)
    setInCorso(null)
    if ('errore' in r) { toast.error(r.errore); return }
    setCorrezioni({ ...correzioni, [voceId]: c })
    setSuperato('Ricalcola: dopo il calcolo sono state modificate delle voci')
    setAperta(null)
    await calcola()
  }

  const trasferisci = async () => {
    if (dati.preventivi.length > 0 && !confirm('Da questo rilievo e\' gia\' stato creato un preventivo. Crearne un altro?')) return
    setInCorso('trasferimento')
    try {
      const r = await trasferisciInPreventivi(rilievoId)
      if ('errore' in r) { toast.error(r.errore); return }
      toast.success('Preventivo creato')
      router.push(`/preventivi/${r.preventivoId}`)
    } finally {
      setInCorso(null)
    }
  }

  const profiloCambiato = calcolo !== null && calcolo.configPrevFpId !== configId

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <a href="/rilievo/cantiere" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ChevronLeft className="mr-1 size-4" />Rilievi</a>
      <div>
        <h1 className="text-xl font-semibold">Calcolo · {nomeCliente(dati.cliente) || 'Senza nome'}</h1>
        {dati.cliente.cantiere && <p className="text-sm text-muted-foreground">{dati.cliente.cantiere}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Profilo di calcolo di FP PRO
          <select className="mt-1 block h-10 rounded-md border bg-background px-2" value={configId ?? ''}
            onChange={e => setConfigId(Number(e.target.value))}>
            {dati.profili.map(p => <option key={p.fpId} value={p.fpId}>{p.nome}</option>)}
          </select>
        </label>
        <Button onClick={calcola} disabled={configId === null || inCorso !== null}>
          {inCorso === 'calcolo' && <Loader2 className="mr-2 size-4 animate-spin" />}{calcolo ? 'Ricalcola' : 'Calcola'}
        </Button>
        {dati.profili.length === 0 && <p className="text-sm text-amber-700">Nessun profilo di calcolo: sincronizza FP PRO dal Catalogo FP PRO.</p>}
      </div>

      {calcolo && (
        <>
          {profiloCambiato && <p className="text-sm text-amber-700">Il calcolo mostrato usa un altro profilo: premi Ricalcola.</p>}
          {superato && <p className="text-sm text-amber-700">{superato} (le misure o le correzioni sono cambiate dopo il calcolo).</p>}
          <p className="text-xs text-muted-foreground">
            Profilo {calcolo.nomeProfilo} · calcolato il {new Date(calcolo.calcolatoAt).toLocaleString('it-IT')}.
            Stima: i materiali esatti per la produzione li calcola FP PRO.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th className="p-2">Voce</th><th className="p-2 text-right">Q.tà</th><th className="p-2 text-right">Materiali</th>
                  <th className="p-2 text-right">Ore</th><th className="p-2 text-right">Prezzo unit.</th><th className="p-2 text-right">Totale</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {calcolo.voci.map(v => (
                  <Fragment key={v.voceId}>
                    <tr className="border-t align-top">
                      <td className="p-2">
                        <button type="button" className="flex items-start gap-1 text-left" onClick={() => setDettaglio(dettaglio === v.voceId ? null : v.voceId)}>
                          {dettaglio === v.voceId ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                          <span>
                            <span className="block font-medium">{v.posizione ? `${v.posizione} · ` : ''}{v.struttura}</span>
                            <span className="block text-xs text-muted-foreground">{v.larghezza} × {v.altezza} mm</span>
                            {correzioni[v.voceId] && <span className="block text-xs text-blue-700">con correzioni</span>}
                            {v.calcolo.avvisi.map((a, i) => <span key={i} className="block text-xs text-amber-700">{a}</span>)}
                          </span>
                        </button>
                      </td>
                      <td className="p-2 text-right">{v.quantita}</td>
                      <td className="p-2 text-right">{formatEuro(v.calcolo.materiali)}</td>
                      <td className="p-2 text-right">{oreTotali(v.calcolo.ore).toFixed(2)}</td>
                      <td className="p-2 text-right">{formatEuro(v.calcolo.prezzo.imponibile)}</td>
                      <td className="p-2 text-right font-medium">{formatEuro(v.calcolo.prezzo.imponibile * v.quantita)}</td>
                      <td className="p-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => setAperta(aperta === v.voceId ? null : v.voceId)}>Correggi</Button>
                      </td>
                    </tr>
                    {dettaglio === v.voceId && <tr><td colSpan={7} className="px-8 pb-3"><DettaglioMateriali voce={v} /></td></tr>}
                    {aperta === v.voceId && (
                      <tr><td colSpan={7} className="p-2">
                        <Correzioni iniziali={correzioni[v.voceId] ?? {}} oreAttuali={v.calcolo.ore} inCorso={inCorso !== null} onSalva={c => void salvaCorrezioni(v.voceId, c)} />
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="p-2 font-medium" colSpan={5}>Totale imponibile</td>
                  <td className="p-2 text-right font-semibold">{formatEuro(calcolo.totaleImponibile)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {calcolo.saltate.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              Voci non calcolate: {calcolo.saltate.map(s => `${s.posizione || 'voce'} (${s.motivo})`).join(', ')}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-11" onClick={trasferisci} disabled={inCorso !== null || calcolo.voci.length === 0 || profiloCambiato || superato !== null}>
              {inCorso === 'trasferimento' && <Loader2 className="mr-2 size-4 animate-spin" />}Trasferisci in Preventivi
            </Button>
            {dati.preventivi.map(p => (
              <a key={p.id} href={`/preventivi/${p.id}`} className="text-sm underline">Preventivo {p.numero ?? ''}</a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
