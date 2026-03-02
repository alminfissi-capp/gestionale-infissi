import { createClient } from '@/lib/supabase/server'
import { getSettings, getNoteTemplates, getLogoSignedUrl } from '@/actions/impostazioni'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import FormAzienda from '@/components/impostazioni/FormAzienda'
import UploadLogo from '@/components/impostazioni/UploadLogo'
import TemplateNote from '@/components/impostazioni/TemplateNote'
import FormAliquoteIva from '@/components/impostazioni/FormAliquoteIva'

export default async function ImpostazioniPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  const [settings, templates] = await Promise.all([
    getSettings(),
    getNoteTemplates(),
  ])

  // Genera URL firmato per il logo se presente
  const logoSignedUrl = settings?.logo_url
    ? await getLogoSignedUrl(settings.logo_url)
    : null

  const defaultValues = {
    denominazione: settings?.denominazione ?? '',
    indirizzo: settings?.indirizzo ?? '',
    piva: settings?.piva ?? '',
    codice_fiscale: settings?.codice_fiscale ?? '',
    telefono: settings?.telefono ?? '',
    email: settings?.email ?? '',
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        <p className="text-sm text-gray-500 mt-1">Configura i dati aziendali e le preferenze del gestionale.</p>
      </div>

      {/* Dati aziendali */}
      <Card>
        <CardHeader>
          <CardTitle>Dati aziendali</CardTitle>
          <CardDescription>
            Questi dati vengono usati nell&apos;intestazione dei PDF dei preventivi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormAzienda defaultValues={defaultValues} />
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo aziendale</CardTitle>
          <CardDescription>
            Appare nella sidebar e nei PDF. Formati supportati: PNG, JPG, SVG, WEBP — max 2MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadLogo
            orgId={profile!.organization_id}
            currentLogoUrl={logoSignedUrl}
            currentLogoPath={settings?.logo_url ?? null}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Template note */}
      <Card>
        <CardHeader>
          <CardTitle>Template note</CardTitle>
          <CardDescription>
            Testi predefiniti selezionabili nel campo note durante la creazione di un preventivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateNote initialTemplates={templates} />
        </CardContent>
      </Card>

      {/* Aliquote IVA */}
      <Card>
        <CardHeader>
          <CardTitle>Aliquote IVA</CardTitle>
          <CardDescription>Aliquote selezionabili nei preventivi.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormAliquoteIva initialAliquote={settings?.aliquote_iva ?? [22, 10, 4]} />
        </CardContent>
      </Card>
    </div>
  )
}
