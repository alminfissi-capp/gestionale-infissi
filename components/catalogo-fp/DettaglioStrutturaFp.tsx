'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { getStrutturaFp } from '@/actions/catalogo-fp'
import { accessoriStruttura, regolaQuantita, riassuntoPezzi, vistaPoligoni } from '@/lib/fppro/strutture'
import type { StrutturaFpDettaglio } from '@/types/fppro'

interface Props {
  id: string | null
  onChiudi: () => void
}

export default function DettaglioStrutturaFp({ id, onChiudi }: Props) {
  // Il risultato ricorda per quale struttura e' arrivato: aprendone un'altra non si
  // vede mai il disegno o l'errore della precedente.
  const [risultato, setRisultato] = useState<{ id: string; struttura: StrutturaFpDettaglio | null; errore: string | null } | null>(null)

  useEffect(() => {
    if (!id) return
    let annullato = false
    getStrutturaFp(id)
      .then(r => {
        if (annullato) return
        setRisultato('errore' in r ? { id, struttura: null, errore: r.errore } : { id, struttura: r.struttura, errore: null })
      })
      .catch(() => {
        if (!annullato) setRisultato({ id, struttura: null, errore: 'Struttura non caricata: controlla la connessione e riprova.' })
      })
    return () => { annullato = true }
  }, [id])

  const corrente = risultato && risultato.id === id ? risultato : null
  const s = corrente?.struttura ?? null
  const errore = corrente?.errore ?? null
  const vista = s ? vistaPoligoni(s.poligoni) : null
  const pezzi = s ? riassuntoPezzi(s.albero) : []
  const { accessori, kit } = s ? accessoriStruttura(s.albero) : { accessori: [], kit: [] }

  return (
    <Dialog open={id !== null} onOpenChange={aperto => { if (!aperto) onChiudi() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s?.nome ?? 'Struttura'}</DialogTitle>
        </DialogHeader>
        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {!s && !errore && <p className="text-sm text-muted-foreground">Caricamento…</p>}
        {s && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              {s.codice && <span className="font-mono">{s.codice}</span>}
              <span>{s.percorso}</span>
              {s.l_nominale !== null && s.h_nominale !== null && <span>{s.l_nominale} × {s.h_nominale} mm (misure di FP PRO)</span>}
              {s.serie.map(x => <Badge key={x} variant="secondary">{x}</Badge>)}
            </div>
            {s.errore && <p className="text-destructive">File non leggibile: {s.errore}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border bg-white p-2">
                {vista ? (
                  <svg viewBox={vista.viewBox} className="w-full h-72" role="img" aria-label={`Disegno di ${s.nome}`}>
                    {vista.punti.map((p, i) => (
                      <polygon key={i} points={p} fill="#d4d4d8" stroke="#3f3f46" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                ) : (
                  <div className="h-72 grid place-items-center text-muted-foreground">Disegno non disponibile</div>
                )}
              </div>
              <div className="rounded-md border bg-white p-2 grid place-items-center">
                {s.immagineUrl
                  ? <img src={s.immagineUrl} alt={`Immagine FP PRO di ${s.nome}`} className="max-h-72" />
                  : <span className="text-muted-foreground">Immagine non disponibile</span>}
              </div>
            </div>

            <section>
              <h3 className="font-medium mb-2">Pezzi</h3>
              <div className="overflow-x-auto"><table className="w-full text-left">
                <thead className="text-muted-foreground"><tr><th className="py-1">Ruolo</th><th>Profilo / codice</th><th>Serie</th><th className="text-right">Pz</th></tr></thead>
                <tbody>
                  {pezzi.map((p, i) => (
                    <tr key={`${p.ruolo}|${p.serie}|${p.profilo}|${i}`} className="border-t">
                      <td className="py-1">{p.ruolo}</td><td className="font-mono text-xs">{p.profilo}</td><td>{p.serie}</td><td className="text-right">{p.quantita}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>

            {kit.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Kit</h3>
                <ul className="space-y-1">
                  {kit.map((k, i) => (
                    <li key={`${k.codice}-${i}`} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{k.codice}</span>
                      <span>{k.descrizione}</span>
                      {k.opzionale && <Badge variant={k.confermato ? 'default' : 'outline'}>{k.confermato ? 'opzione scelta' : 'opzione'}</Badge>}
                      <span className="text-muted-foreground">{k.accessori.length} accessori</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {accessori.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Accessori</h3>
                <div className="overflow-x-auto"><table className="w-full text-left">
                  <thead className="text-muted-foreground"><tr><th className="py-1">Codice</th><th>Descrizione</th><th>Quantità</th></tr></thead>
                  <tbody>
                    {accessori.map((a, i) => (
                      <tr key={`${a.codice}-${i}`} className="border-t">
                        <td className="py-1 font-mono text-xs whitespace-nowrap">{a.codice}</td><td>{a.descrizione}</td><td className="whitespace-nowrap">{regolaQuantita(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
