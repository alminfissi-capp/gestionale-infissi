'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getMetodiIncasso, salvaMetodiIncasso, type DatiMetodiIncasso } from '@/actions/fatture-emesse'
import type { MetodiIncassoFic, MetodoIncasso } from '@/types/fatture-emesse'

const ETICHETTE: Record<MetodoIncasso, string> = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}
const NESSUNO = 'nessuno'

/** Con quale conto FiC si segna incassata una fattura, per ogni metodo d'incasso di WinStudio. */
export default function MetodiIncassoFic({ puoModificare }: { puoModificare: boolean }) {
  const [dati, setDati] = useState<DatiMetodiIncasso | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [abbinamento, setAbbinamento] = useState<MetodiIncassoFic | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let annullato = false
    getMetodiIncasso()
      .then((r) => {
        if (annullato) return
        if ('errore' in r) { setErrore(r.errore); return }
        setDati(r)
        setAbbinamento(r.abbinamento)
      })
      .catch(() => { if (!annullato) setErrore('Connessione interrotta') })
    return () => { annullato = true }
  }, [])

  function salva() {
    if (!abbinamento) return
    startTransition(async () => {
      try {
        const r = await salvaMetodiIncasso(abbinamento)
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Metodi d\'incasso salvati')
        setDati((d) => (d ? { ...d, salvato: true } : d))
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="font-medium">Metodi d&apos;incasso</p>
      <p className="text-xs text-muted-foreground">
        Quando un incasso di una commessa paga una fattura emessa, su FiC viene segnato con questo conto.
        Senza abbinamento l&apos;incasso non viene scritto su FiC.
      </p>
      {errore && <p className="text-sm text-destructive">{errore}</p>}
      {dati && abbinamento && (
        <>
          {!dati.salvato && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Proposta in base ai nomi: controlla e salva.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(ETICHETTE) as MetodoIncasso[]).map((m) => (
              <div key={m} className="flex items-center gap-2">
                <span className="w-24 text-sm">{ETICHETTE[m]}</span>
                <Select
                  value={abbinamento[m] === null ? NESSUNO : String(abbinamento[m])}
                  onValueChange={(v) => setAbbinamento({ ...abbinamento, [m]: v === NESSUNO ? null : Number(v) })}
                  disabled={!puoModificare}
                >
                  <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Non scrivere su FiC</SelectItem>
                    {dati.metodiFic.map((x) => <SelectItem key={x.id} value={String(x.id)}>{x.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {puoModificare && (
            <Button variant="outline" size="sm" onClick={salva} disabled={pending}>
              {pending ? 'Salvataggio…' : 'Salva metodi'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
