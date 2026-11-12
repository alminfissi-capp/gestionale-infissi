'use client'

// Trasferimento del rilievo in Preventivi: si sceglie SEMPRE se creare un preventivo nuovo o
// aggiungere le voci a uno esistente. Se quello scelto contiene già le voci di questo
// rilievo, si chiede ogni volta se sostituirle o aggiungerle in fondo (scelta dell'utente).
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FilePlus2, FileSignature, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getPreventiviPerCopia } from '@/actions/preventivi'
import { formatEuro } from '@/lib/pricing'
import { normalizzaTesto } from '@/lib/ricerca-clienti'
import { ordinaPreventiviPerRilievo, type GruppoPreventivo } from '@/lib/fppro/calcolo/trasferimento'
import type { ClienteSnapshot } from '@/types/preventivo'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

type PreventivoLite = Awaited<ReturnType<typeof getPreventiviPerCopia>>[number]
export type SceltaTrasferimento = { preventivoId: string; sostituisci: boolean } | null

const ETICHETTE: Record<GruppoPreventivo, string> = {
  rilievo: 'Contengono gia\' questo rilievo',
  cliente: 'Stesso cliente',
  altri: 'Altri preventivi',
}

const nome = (s: ClienteSnapshot) =>
  (s.tipo === 'azienda' ? s.ragione_sociale : [s.nome, s.cognome].filter(Boolean).join(' ')) || '—'

export default function DialogTrasferimento({ aperta, onChiudi, cliente, daRilievo, inCorso, onScegli }: {
  aperta: boolean
  onChiudi: () => void
  cliente: ClienteSnapshotRilievo
  /** Preventivi che contengono gia' righe di questo rilievo */
  daRilievo: string[]
  inCorso: boolean
  /** null = preventivo nuovo */
  onScegli: (scelta: SceltaTrasferimento) => void
}) {
  const [preventivi, setPreventivi] = useState<PreventivoLite[] | null>(null)
  const [testo, setTesto] = useState('')
  const [doppio, setDoppio] = useState<PreventivoLite | null>(null)

  useEffect(() => {
    if (!aperta) return
    let annullato = false
    getPreventiviPerCopia()
      .then(d => { if (!annullato) setPreventivi(d) })
      .catch(() => { if (!annullato) { setPreventivi([]); toast.error('Preventivi non caricati') } })
    return () => { annullato = true }
  }, [aperta])

  const elenco = useMemo(() => {
    if (!preventivi) return []
    const q = normalizzaTesto(testo)
    const filtrati = q
      ? preventivi.filter(p => normalizzaTesto(`${p.numero ?? ''} ${nome(p.cliente_snapshot)}`).includes(q))
      : preventivi
    return ordinaPreventiviPerRilievo(filtrati, new Set(daRilievo), {
      tipo: cliente.tipo ?? 'privato', ragione_sociale: cliente.ragione_sociale ?? null,
      nome: cliente.nome ?? null, cognome: cliente.cognome ?? null, telefono: cliente.telefono ?? null,
    })
  }, [preventivi, testo, daRilievo, cliente])

  const scegli = (p: PreventivoLite) => {
    if (daRilievo.includes(p.id)) setDoppio(p)
    else onScegli({ preventivoId: p.id, sostituisci: false })
  }

  return (
    <>
      <Dialog open={aperta && !doppio} onOpenChange={o => { if (!o && !inCorso) onChiudi() }}>
        <DialogContent className="sm:max-w-lg xl:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trasferisci in Preventivi</DialogTitle>
            <DialogDescription>Crea un preventivo nuovo oppure aggiungi le voci a un preventivo esistente.</DialogDescription>
          </DialogHeader>
          <Button className="h-11 gap-2" onClick={() => onScegli(null)} disabled={inCorso}>
            {inCorso ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}Crea un preventivo nuovo
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Oppure cerca un preventivo per numero o cliente..." value={testo}
              onChange={e => setTesto(e.target.value)} className="pl-8" />
          </div>
          {preventivi === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" />Caricamento...
            </div>
          ) : elenco.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun preventivo trovato.</p>
          ) : (
            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto py-1">
              {elenco.map((p, i) => {
                const bloccato = p.firma_stato === 'in_attesa' || p.firma_stato === 'firmato'
                return (
                  <div key={p.id}>
                    {(i === 0 || elenco[i - 1].gruppo !== p.gruppo) && (
                      <p className="px-1 pb-1 pt-2 text-xs font-medium uppercase text-muted-foreground">{ETICHETTE[p.gruppo]}</p>
                    )}
                    <button type="button" disabled={bloccato || inCorso} onClick={() => scegli(p)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        bloccato ? 'cursor-not-allowed opacity-60' : 'hover:border-primary hover:bg-primary/5'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{p.numero ?? 'Senza numero'}</span>
                          {bloccato && (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-300 px-1 py-0.5 text-[10px] leading-none text-amber-600">
                              <FileSignature className="size-2.5" />{p.firma_stato === 'firmato' ? 'firmato' : 'firma in corso'}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {nome(p.cliente_snapshot)} · {new Date(p.created_at).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium">{formatEuro(p.totale_finale)}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={aperta && !!doppio} onOpenChange={o => { if (!o && !inCorso) setDoppio(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voci già presenti</DialogTitle>
            <DialogDescription>
              Il preventivo {doppio?.numero ?? ''} contiene già le voci di questo rilievo. Vuoi sostituirle con quelle
              ricalcolate o aggiungere le nuove in fondo?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDoppio(null)} disabled={inCorso}>Indietro</Button>
            <Button variant="outline" disabled={inCorso}
              onClick={() => doppio && onScegli({ preventivoId: doppio.id, sostituisci: false })}>Aggiungi in fondo</Button>
            <Button disabled={inCorso} onClick={() => doppio && onScegli({ preventivoId: doppio.id, sostituisci: true })}>
              {inCorso && <Loader2 className="mr-2 size-4 animate-spin" />}Sostituisci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
