'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import { parseImporto } from '@/lib/fic/pagamenti'
import { controllaQuote, ripartisciIncasso, type ControlloQuote, type IncassoDaRipartire } from '@/lib/fic/incassi'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import { getDatiIncassoFatture, salvaQuoteIncasso } from '@/actions/fic-incassi'
import type { RiepilogoCollegamento } from '@/types/fatture-fornitori'
import type { DatiIncassoFatture, MetodoIncasso, QuotaIncasso } from '@/types/fatture-emesse'

const cent = (v: number) => Math.round(v * 100) / 100

export type FattureIncasso = {
  dati: DatiIncassoFatture | null
  /** Quote correnti: la ripartizione automatica finche' non si tocca niente, poi quelle scritte a mano. */
  quote: QuotaIncasso[]
  controllo: ControlloQuote
  manuali: Record<number, string> | null
  setManuali: (m: Record<number, string> | null) => void
  /** La sezione ha senso solo se la commessa ha fatture collegate. */
  attiva: boolean
}

/**
 * Stato della sezione "Fatture pagate da questo incasso". `accontoId` null = nuovo
 * incasso: si propone la ripartizione automatica; altrimenti si parte dalle quote salvate.
 */
export function useFattureIncasso(
  commessaId: string, accontoId: string | null, incasso: IncassoDaRipartire, aperta: boolean,
  /** Cambiarla ricarica i dati (dopo aver registrato un incasso). */
  chiave = 0,
): FattureIncasso {
  const [dati, setDati] = useState<DatiIncassoFatture | null>(null)
  const [manuali, setManuali] = useState<Record<number, string> | null>(null)

  useEffect(() => {
    if (!aperta) return
    let annullato = false
    void (async () => {
      try {
        const r = await getDatiIncassoFatture(commessaId, accontoId)
        if (annullato) return
        if (!r.ok) { toast.error(r.errore); return }
        setDati(r.dati)
        setManuali(accontoId && r.dati.quote.length
          ? Object.fromEntries(r.dati.quote.map((q) => [q.fic_documento_id, formatEuro(q.importo)]))
          : null)
      } catch {
        // senza i dati la sezione resta nascosta: l'incasso si registra comunque
      }
    })()
    return () => { annullato = true }
  }, [commessaId, accontoId, aperta, chiave])

  const quote = useMemo<QuotaIncasso[]>(() => {
    if (!dati) return []
    if (manuali === null) return ripartisciIncasso(incasso, dati.fatture)
    return Object.entries(manuali).map(([id, testo]) => ({
      fic_documento_id: Number(id),
      tipo_documento: dati.fatture.find((f) => f.fic_id === Number(id))?.tipo ?? 'fattura',
      importo: cent(parseImporto(testo) ?? 0),
    }))
  }, [dati, manuali, incasso])

  const controllo = useMemo(
    () => controllaQuote(incasso, dati?.fatture ?? [], quote),
    [incasso, dati, quote],
  )

  return { dati, quote, controllo, manuali, setManuali, attiva: Boolean(dati && dati.fatture.length > 0) }
}

export function SezioneFattureIncasso({
  stato, metodo,
}: {
  stato: FattureIncasso
  metodo: MetodoIncasso
}) {
  const { dati, quote, controllo, manuali, setManuali } = stato
  if (!dati || dati.fatture.length === 0) return null
  const valori: Record<number, string> = manuali
    ?? Object.fromEntries(quote.map((q) => [q.fic_documento_id, formatEuro(q.importo)]))
  const senzaMetodo = dati.metodi[metodo] === null || dati.metodi[metodo] === undefined

  function cambia(id: number, testo: string | null) {
    const nuovi = { ...valori }
    if (testo === null) delete nuovi[id]
    else nuovi[id] = testo
    setManuali(nuovi)
  }

  return (
    <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Fatture pagate da questo incasso</p>
        {manuali !== null && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setManuali(null)}>Ripartisci di nuovo</Button>
        )}
      </div>
      <div className="space-y-1.5">
        {dati.fatture.filter((f) => f.tipo === 'fattura').map((f) => {
          const presa = valori[f.fic_id] !== undefined
          return (
            <div key={f.fic_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-background p-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={presa}
                onChange={(e) => cambia(f.fic_id, e.target.checked ? formatEuro(Math.max(0, Math.min(f.disponibile, f.quota_libera))) : null)}
                aria-label={`Paga la fattura ${f.numero ?? ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">n. {f.numero ?? '—'} del {formatData(f.data)}</div>
                <div className="text-xs text-muted-foreground">
                  Totale € {formatEuro(f.importo_lordo)}
                  {f.ritenuta > 0 && ` (ritenuta in fattura € ${formatEuro(f.ritenuta)})`}
                  {' · '}da incassare su FiC € {formatEuro(f.disponibile)}
                  {' · '}quota commessa libera € {formatEuro(Math.max(0, f.quota_libera))}
                </div>
              </div>
              {presa && (
                <Input
                  className="h-8 w-28 text-right"
                  inputMode="decimal"
                  value={valori[f.fic_id]}
                  onChange={(e) => cambia(f.fic_id, e.target.value)}
                  aria-label="Importo su questa fattura"
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="text-xs">
        Su FiC: <strong>€ {formatEuro(controllo.totaleFic)}</strong> · copre <strong>€ {formatEuro(controllo.coperto)}</strong> dell&apos;incasso
      </div>
      {senzaMetodo && quote.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Questo metodo non è abbinato a un conto FiC (Impostazioni → Fatture in Cloud): l&apos;incasso non verrà scritto su FiC.
        </p>
      )}
      {controllo.errori.map((e) => <p key={e} className="text-xs text-destructive">{e}</p>)}
      {controllo.avvisi.map((a) => <p key={a} className="text-xs text-amber-700 dark:text-amber-400">{a}</p>)}
    </div>
  )
}

/** Prima del salvataggio: false se ci sono errori o se l'utente non conferma gli avvisi. */
export function quoteConfermate(stato: FattureIncasso): boolean {
  if (!stato.attiva) return true
  if (stato.controllo.errori.length) {
    toast.error(stato.controllo.errori[0])
    return false
  }
  if (stato.controllo.avvisi.length) return window.confirm(`${stato.controllo.avvisi.join('\n')}\n\nSalvare lo stesso?`)
  return true
}

/** Dopo aver registrato l'incasso: collega le fatture e scrive su FiC. */
export async function salvaFattureDiIncasso(accontoId: string, stato: FattureIncasso) {
  if (!stato.attiva || (stato.quote.length === 0 && !stato.dati?.quote.length)) return
  try {
    const r = await salvaQuoteIncasso(accontoId, stato.quote)
    if (!r.ok) toast.warning(`Incasso registrato, ma le fatture non sono collegate: ${r.errore}`, { duration: 10000 })
    else mostraEsitoFic(r.esito)
  } catch {
    toast.warning('Incasso registrato, ma la connessione si è interrotta prima di FiC: controlla in Fatture → Clienti')
  }
}

const COLORE: Record<RiepilogoCollegamento['stato'], string> = {
  scritto: 'text-emerald-600',
  non_scritto: 'text-muted-foreground',
  problema: 'text-rose-600',
}

/** Pulsante accanto a un incasso gia' registrato: stato su FiC e modifica delle fatture pagate. */
export function PulsanteFicIncasso({
  commessaId, acconto, riepilogo,
}: {
  commessaId: string
  acconto: { id: string; importo: number; ritenuta: number; ritenuta_tipo: IncassoDaRipartire['ritenuta_tipo']; metodo_pagamento: string }
  riepilogo: RiepilogoCollegamento | undefined
}) {
  const [aperta, setAperta] = useState(false)
  const titolo = !riepilogo
    ? 'Collega alle fatture FiC'
    : riepilogo.stato === 'problema'
      ? `FiC: ${riepilogo.messaggio ?? 'da allineare'}`
      : riepilogo.stato === 'scritto' ? 'Scritto su FiC' : 'Non ancora scritto su FiC'
  return (
    <>
      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7" title={titolo} aria-label={titolo}
        onClick={() => setAperta(true)}
      >
        <Receipt className={`h-3.5 w-3.5 ${riepilogo ? COLORE[riepilogo.stato] : 'text-muted-foreground/60'}`} />
      </Button>
      {aperta && <DialogQuoteIncasso commessaId={commessaId} acconto={acconto} onClose={() => setAperta(false)} />}
    </>
  )
}

function DialogQuoteIncasso({
  commessaId, acconto, onClose,
}: {
  commessaId: string
  acconto: { id: string; importo: number; ritenuta: number; ritenuta_tipo: IncassoDaRipartire['ritenuta_tipo']; metodo_pagamento: string }
  onClose: () => void
}) {
  const router = useRouter()
  const incasso = useMemo(
    () => ({ importo: acconto.importo, ritenuta: acconto.ritenuta, ritenuta_tipo: acconto.ritenuta_tipo }),
    [acconto.importo, acconto.ritenuta, acconto.ritenuta_tipo],
  )
  const stato = useFattureIncasso(commessaId, acconto.id, incasso, true)
  const [salvataggio, setSalvataggio] = useState(false)

  async function salva() {
    if (!quoteConfermate(stato)) return
    setSalvataggio(true)
    try {
      const r = await salvaQuoteIncasso(acconto.id, stato.quote)
      if (!r.ok) { toast.error(r.errore); return }
      mostraEsitoFic(r.esito)
      router.refresh()
      onClose()
    } catch {
      toast.error('Connessione interrotta: ricarica la pagina per vedere l\'esito')
    } finally {
      setSalvataggio(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-xl xl:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Incasso di € {formatEuro(acconto.importo)}</DialogTitle>
          <DialogDescription>
            Fatture di Fatture in Cloud pagate da questo incasso.
            {acconto.ritenuta > 0 && <Badge variant="outline" className="ml-2">ritenuta € {formatEuro(acconto.ritenuta)}</Badge>}
          </DialogDescription>
        </DialogHeader>
        {!stato.dati ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Caricamento…</p>
        ) : !stato.attiva ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            La commessa non ha fatture emesse collegate: collegale dal menu ⋮ → Fatture emesse.
          </p>
        ) : (
          <>
            <SezioneFattureIncasso stato={stato} metodo={acconto.metodo_pagamento as MetodoIncasso} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={salvataggio}>Annulla</Button>
              <Button onClick={salva} disabled={salvataggio || stato.controllo.errori.length > 0}>
                {salvataggio ? 'Scrittura su FiC…' : 'Salva e scrivi su FiC'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
