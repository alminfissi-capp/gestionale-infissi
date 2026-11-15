'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { eliminaIntegrazione, salvaIntegrazione } from '@/actions/integrazioni'
import type { CampoIntegrazione, Servizio } from '@/lib/integrazioni-nomi'

interface Props {
  servizio: Servizio
  campo: CampoIntegrazione
  etichetta: string
  /** Cosa e' salvato (mai il valore) */
  stato: { ultime4: string; aggiornato_at: string } | undefined
  /** Campo segreto: si scrive a occhi chiusi e si mostrano solo le ultime 4 cifre */
  segreto?: boolean
  puoModificare: boolean
  aiuto?: string
  /** Salvataggio diverso da quello standard (es. Stripe, che deve anche creare il webhook) */
  salva?: (valore: string) => Promise<{ errore?: string }>
  elimina?: () => Promise<void>
}

/** Campo di una chiave di servizio: solo scrittura, si sostituisce o si elimina, non si rilegge. */
export default function CampoSegreto({ servizio, campo, etichetta, stato, segreto = true, puoModificare, aiuto, salva, elimina }: Props) {
  const router = useRouter()
  const [modifica, setModifica] = useState(!stato)
  const [valore, setValore] = useState('')
  const [inCorso, avvia] = useTransition()
  const id = `${servizio}-${campo}`

  const conferma = () => avvia(async () => {
    const r = salva ? await salva(valore) : await salvaIntegrazione(servizio, campo, valore)
    if (r.errore) { toast.error(r.errore); return }
    toast.success(`${etichetta} salvata`)
    setValore('')
    setModifica(false)
    router.refresh()
  })
  const togli = () => avvia(async () => {
    await (elimina ? elimina() : eliminaIntegrazione(servizio, campo))
    toast.success(`${etichetta} eliminata`)
    setModifica(true)
    router.refresh()
  })

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etichetta}</Label>
      {stato && !modifica ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {segreto ? `Salvata · termina con …${stato.ultime4}` : stato.ultime4} · {new Date(stato.aggiornato_at).toLocaleDateString('it-IT')}
          </span>
          {puoModificare && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setModifica(true)} disabled={inCorso}>Sostituisci</Button>
              <Button type="button" variant="ghost" size="sm" onClick={togli} disabled={inCorso}>Elimina</Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input id={id} type={segreto ? 'password' : 'email'} autoComplete="off" value={valore} disabled={!puoModificare || inCorso}
            onChange={e => setValore(e.target.value)} placeholder={segreto ? 'Incolla qui la chiave' : 'email@esempio.it'} />
          <Button type="button" onClick={conferma} disabled={!puoModificare || inCorso || !valore.trim()}>
            {inCorso && <Loader2 className="size-4 animate-spin" />} Salva
          </Button>
          {stato && <Button type="button" variant="ghost" onClick={() => setModifica(false)} disabled={inCorso}>Annulla</Button>}
        </div>
      )}
      {aiuto && <p className="text-xs text-muted-foreground">{aiuto}</p>}
    </div>
  )
}
