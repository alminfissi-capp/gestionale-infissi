import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import CampoSegreto from '@/components/impostazioni/CampoSegreto'
import CreditoOpenapi from '@/components/impostazioni/CreditoOpenapi'
import type { StatoIntegrazioni } from '@/actions/integrazioni'

interface Props {
  stato: StatoIntegrazioni
  puoModificare: boolean
}

/** Tab "Collegamenti": chiavi dei servizi esterni scritte in WinStudio (Vault), mai mostrate. */
export default function SezioneCollegamenti({ stato, puoModificare }: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>openapi.it — firma elettronica</CardTitle>
          <CardDescription>
            Le chiavi si salvano cifrate e non si possono rileggere: si sostituiscono o si eliminano.
            Finché non le scrivi qui, WinStudio usa quelle impostate sul server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CampoSegreto servizio="openapi" campo="email" etichetta="Email dell'account" segreto={false} stato={stato['openapi.email']} puoModificare={puoModificare} />
          <CampoSegreto servizio="openapi" campo="apikey" etichetta="APIkey" stato={stato['openapi.apikey']} puoModificare={puoModificare}
            aiuto="Dalla console di openapi.it, sezione API key: serve per leggere il saldo dei crediti." />
          <CampoSegreto servizio="openapi" campo="token_firma" etichetta="Token della firma" stato={stato['openapi.token_firma']} puoModificare={puoModificare}
            aiuto="Il token della firma funziona solo dal sito pubblicato (openapi.it accetta solo gli indirizzi autorizzati)." />
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Crediti</p>
            <CreditoOpenapi />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
