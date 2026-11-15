'use client'

import { Badge } from '@/components/ui/badge'
import CampoSegreto from '@/components/impostazioni/CampoSegreto'
import { collegaStripe, scollegaStripe } from '@/actions/stripe-collegamento'

interface Props {
  chiave: { ultime4: string; aggiornato_at: string } | undefined
  /** Riga di stato del webhook: ultime4 contiene la modalita' (prova/reale) */
  webhook: { ultime4: string; aggiornato_at: string } | undefined
  puoModificare: boolean
}

export default function CollegamentoStripe({ chiave, webhook, puoModificare }: Props) {
  const modalita = webhook?.ultime4 === 'reale' ? 'reale' : webhook?.ultime4 === 'prova' ? 'prova' : null
  return (
    <div className="space-y-3">
      {chiave && (
        <div className="flex flex-wrap items-center gap-2">
          {modalita === 'prova' && <Badge variant="secondary">Modalità prova</Badge>}
          {modalita === 'reale' && <Badge>Modalità reale</Badge>}
          <span className="text-sm text-muted-foreground">{webhook ? 'Collegato · ricevute dei pagamenti attive' : 'Chiave salvata, collegamento da rifare'}</span>
        </div>
      )}
      <CampoSegreto servizio="stripe" campo="chiave_segreta" etichetta="Chiave segreta" stato={chiave} puoModificare={puoModificare}
        aiuto="Dashboard Stripe → Sviluppatori → Chiavi API: la chiave segreta (sk_test_… per le prove, sk_live_… per i pagamenti veri)."
        salva={async v => { const r = await collegaStripe(v); return { errore: r.errore } }}
        elimina={scollegaStripe} />
    </div>
  )
}
