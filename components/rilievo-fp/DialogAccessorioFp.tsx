'use client'

// "Aggiungi accessorio" della voce: come in FP PRO si sfoglia marchio > serie (es. MEDISYSTEM >
// AUTOMAZIONI) o si cerca per codice/descrizione. Serve la rete: gli accessori sono ~21.000.
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cercaAccessoriFp, type AccessorioCatalogoFp, type SerieAccessoriFp } from '@/actions/rilievo-fp'

interface Props {
  aperto: boolean
  onChiudi: () => void
  /** Marchi e serie (caricati da chi apre la finestra) */
  serie: SerieAccessoriFp[]
  onAggiungi: (a: AccessorioCatalogoFp) => void
}

const SENZA_MARCHIO = '(senza marchio)'

export default function DialogAccessorioFp({ aperto, onChiudi, serie, onAggiungi }: Props) {
  const [marca, setMarca] = useState('')
  const [nomeSerie, setNomeSerie] = useState('')
  const [testo, setTesto] = useState('')
  const [risultati, setRisultati] = useState<AccessorioCatalogoFp[] | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const marche = [...new Set(serie.map(s => s.marca))]
  const serieDelMarchio = serie.filter(s => !marca || s.marca === (marca === SENZA_MARCHIO ? '' : marca))

  const cerca = async (f: { marca: string; serie: string; testo: string }) => {
    if (!f.marca && !f.serie && !f.testo.trim()) { setRisultati(null); return }
    setInCorso(true)
    try {
      const r = await cercaAccessoriFp({ marca: f.marca === SENZA_MARCHIO ? '' : f.marca || null, serie: f.serie || null, testo: f.testo })
      if ('errore' in r) { toast.error(r.errore); return }
      setRisultati(r)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={o => { if (!o) onChiudi() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aggiungi accessorio</DialogTitle>
          <DialogDescription>Scegli marchio e serie (es. MEDISYSTEM, AUTOMAZIONI) oppure cerca per codice o descrizione.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="acc-marca" className="text-xs">Marchio</Label>
            <select id="acc-marca" className="block h-9 w-full rounded-md border bg-background px-2 text-sm" value={marca}
              onChange={e => { setMarca(e.target.value); setNomeSerie(''); void cerca({ marca: e.target.value, serie: '', testo }) }}>
              <option value="">Tutti</option>
              {marche.map(m => <option key={m || SENZA_MARCHIO} value={m || SENZA_MARCHIO}>{m || SENZA_MARCHIO}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="acc-serie" className="text-xs">Serie</Label>
            <select id="acc-serie" className="block h-9 w-full rounded-md border bg-background px-2 text-sm" value={nomeSerie}
              onChange={e => { setNomeSerie(e.target.value); void cerca({ marca, serie: e.target.value, testo }) }}>
              <option value="">Tutte</option>
              {serieDelMarchio.map(s => <option key={`${s.marca}|${s.serie}`} value={s.serie}>{s.serie || '(senza serie)'} · {s.accessori}</option>)}
            </select>
          </div>
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void cerca({ marca, serie: nomeSerie, testo }) }}>
          <Input placeholder="Codice o descrizione (es. maniglione, motore)" value={testo} onChange={e => setTesto(e.target.value)} />
          <Button type="submit" variant="outline" className="gap-1.5" disabled={inCorso}>
            {inCorso ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Cerca
          </Button>
        </form>
        {serie.length > 0 && marche.every(m => !m) && (
          <p className="text-xs text-amber-700">I marchi arrivano con la prossima sincronizzazione di FP PRO: per ora si sfoglia per serie.</p>
        )}
        <div className="max-h-[50dvh] overflow-y-auto rounded-md border">
          {risultati === null && <p className="p-3 text-sm text-muted-foreground">Scegli una serie o cerca.</p>}
          {risultati?.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessun accessorio trovato.</p>}
          {risultati?.map(a => (
            <button key={`${a.serie}|${a.codice}`} type="button" className="flex w-full items-start gap-2 border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
              onClick={() => onAggiungi(a)}>
              <Plus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block">{a.descrizione || a.codice}</span>
                <span className="block text-xs text-muted-foreground">{a.codice}{a.serie ? ` · ${a.serie}` : ''}</span>
              </span>
            </button>
          ))}
          {risultati?.length === 100 && <p className="p-2 text-xs text-muted-foreground">Primi 100: restringi la ricerca.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
