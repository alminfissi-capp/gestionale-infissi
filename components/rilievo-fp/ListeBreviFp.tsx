'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { getPreferenzeFp, impostaPreferenzaFp } from '@/actions/rilievo-fp'
import { getElenchiBreviFp } from '@/actions/catalogo-fp'

type Voce = { id: number; testo: string; sotto: string | null }

export default function ListeBreviFp() {
  const [elenchi, setElenchi] = useState<{ colori: Voce[]; vetri: Voce[] }>({ colori: [], vetri: [] })
  const [scelti, setScelti] = useState<Set<string>>(new Set())
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    Promise.all([getElenchiBreviFp(), getPreferenzeFp()]).then(([e, p]) => {
      if ('errore' in e) toast.error(e.errore); else setElenchi(e)
      if ('errore' in p) toast.error(p.errore); else setScelti(new Set(p.map(x => x.id)))
    }).catch(() => toast.error('Liste non disponibili'))
  }, [])

  const cambia = async (tipo: 'colore' | 'vetro', id: number) => {
    const chiave = `${tipo}:${id}`
    const attiva = !scelti.has(chiave)
    const r = await impostaPreferenzaFp(tipo, String(id), attiva)
    if ('errore' in r) { toast.error(r.errore); return }
    setScelti(s => { const n = new Set(s); if (attiva) n.add(chiave); else n.delete(chiave); return n })
  }

  const q = cerca.trim().toLowerCase()
  const blocco = (tipo: 'colore' | 'vetro', titolo: string, voci: Voce[]) => {
    const visibili = voci.filter(v => scelti.has(`${tipo}:${v.id}`) || (q.length >= 2 && `${v.testo} ${v.sotto ?? ''}`.toLowerCase().includes(q)))
    return (
      <section className="space-y-1">
        <h3 className="text-sm font-medium">{titolo} ({voci.filter(v => scelti.has(`${tipo}:${v.id}`)).length} nella lista breve)</h3>
        <ul className="divide-y rounded-md border">
          {visibili.slice(0, 60).map(v => (
            <li key={v.id}>
              <button type="button" onClick={() => cambia(tipo, v.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                <Star className={`size-4 ${scelti.has(`${tipo}:${v.id}`) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
                <span className="flex-1">{v.testo}{v.sotto && <span className="text-xs text-muted-foreground"> · {v.sotto}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">I colori e i vetri con la stella compaiono per primi nel rilievo in cantiere. Cerca per aggiungerne.</p>
      <Input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca colore o vetro (almeno 2 lettere)" aria-label="Cerca colore o vetro" />
      {blocco('colore', 'Colori', elenchi.colori)}
      {blocco('vetro', 'Vetri', elenchi.vetri)}
    </div>
  )
}
