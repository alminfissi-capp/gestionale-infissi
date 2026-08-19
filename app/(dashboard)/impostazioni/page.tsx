import { createClient } from '@/lib/supabase/server'
import { getSettings, getNoteTemplates, getLogoSignedUrl } from '@/actions/impostazioni'
import { getConti } from '@/actions/conti'
import { requireAccesso } from '@/lib/permessi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import FormAzienda from '@/components/impostazioni/FormAzienda'
import UploadLogo from '@/components/impostazioni/UploadLogo'
import TemplateNote from '@/components/impostazioni/TemplateNote'
import FormAliquoteIva from '@/components/impostazioni/FormAliquoteIva'
import FormNumerazione from '@/components/impostazioni/FormNumerazione'
import FormValiditaPreventivo from '@/components/impostazioni/FormValiditaPreventivo'
import ThemeToggle from '@/components/impostazioni/ThemeToggle'
import SezioneFirmaDefault from '@/components/impostazioni/SezioneFirmaDefault'
import FormConti from '@/components/impostazioni/FormConti'
import { getOrariLavoro } from '@/actions/calendario'
import FormOrariLavoro from '@/components/impostazioni/FormOrariLavoro'

export default async function ImpostazioniPage() {
  await requireAccesso('impostazioni')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  const [settings, templates, conti, orariLavoro] = await Promise.all([
    getSettings(),
    getNoteTemplates(),
    getConti(),
    getOrariLavoro(),
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
    sito_web: settings?.sito_web ?? '',
    banca: settings?.banca ?? '',
    iban: settings?.iban ?? '',
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">Configura i dati aziendali e le preferenze del gestionale.</p>
      </div>

      {/* Tema */}
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>Scegli il tema dell&apos;interfaccia.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      {/* Conti correnti */}
      <Card>
        <CardHeader>
          <CardTitle>Conti correnti</CardTitle>
          <CardDescription>
            Banche/conti su cui vengono addebitate le scadenze. Il saldo concorre alla liquidità nei Calcoli.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormConti initialConti={conti} />
        </CardContent>
      </Card>

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

      {/* Firma predefinita */}
      <Card>
        <CardHeader>
          <CardTitle>Firma predefinita ricevute</CardTitle>
          <CardDescription>
            Usata come scorciatoia nelle ricevute di pagamento. Puoi sempre tracciare una firma diversa al momento dell&apos;incasso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SezioneFirmaDefault firmaDefault={settings?.firma_default ?? null} />
        </CardContent>
      </Card>

      {/* Orari di lavoro */}
      <Card>
        <CardHeader>
          <CardTitle>Orari di lavoro</CardTitle>
          <CardDescription>
            Determinano le colonne del calendario di produzione, il sabato a mezza
            giornata e i giorni chiusi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormOrariLavoro iniziali={orariLavoro} />
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

      {/* Validità preventivi */}
      <Card>
        <CardHeader>
          <CardTitle>Validità preventivi</CardTitle>
          <CardDescription>
            Dopo quanti giorni dall&apos;invio un preventivo passa automaticamente a <strong>Scaduto</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormValiditaPreventivo
            initialGiorni={settings?.giorni_validita_preventivo ?? 30}
          />
        </CardContent>
      </Card>

      {/* Numerazione preventivi */}
      <Card>
        <CardHeader>
          <CardTitle>Numerazione preventivi</CardTitle>
          <CardDescription>
            Configura il formato del numero progressivo assegnato automaticamente a ogni preventivo.
            Formato: <span className="font-mono text-xs">PREFISSO  NR/ANNO  OPERATORE  CLIENTE</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormNumerazione
            initialPrefisso={settings?.num_prefisso ?? null}
            initialPrefissoCalcoli={settings?.num_prefisso_calcoli ?? null}
            initialOperatore={settings?.num_operatore ?? null}
            initialPadding={settings?.num_padding ?? 2}
            contatore={settings?.num_contatore ?? 0}
            anno={settings?.num_anno ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  )
}
