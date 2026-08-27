import { createClient } from '@/lib/supabase/server'
import { getSettings, getNoteTemplates, getLogoSignedUrl } from '@/actions/impostazioni'
import { getConti } from '@/actions/conti'
import { requireAccesso } from '@/lib/permessi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import FormAzienda from '@/components/impostazioni/FormAzienda'
import UploadLogo from '@/components/impostazioni/UploadLogo'
import TemplateNote from '@/components/impostazioni/TemplateNote'
import FormAliquoteIva from '@/components/impostazioni/FormAliquoteIva'
import FormNumerazione from '@/components/impostazioni/FormNumerazione'
import FormValiditaPreventivo from '@/components/impostazioni/FormValiditaPreventivo'
import ThemeToggle from '@/components/impostazioni/ThemeToggle'
import SezioneFirmaDefault from '@/components/impostazioni/SezioneFirmaDefault'
import FormConti from '@/components/impostazioni/FormConti'
import { getLineeCredito, getAnticipi } from '@/actions/banche'
import FormLineeCredito from '@/components/impostazioni/FormLineeCredito'
import { getOrariLavoro, getChiusure, getTipiAttivita } from '@/actions/calendario'
import FormOrariLavoro from '@/components/impostazioni/FormOrariLavoro'
import FormChiusure from '@/components/impostazioni/FormChiusure'
import FormTipiAttivita from '@/components/impostazioni/FormTipiAttivita'

export default async function ImpostazioniPage() {
  await requireAccesso('impostazioni')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  const [settings, templates, conti, orariLavoro, chiusure, tipiAttivita, linee, anticipi] =
    await Promise.all([
      getSettings(),
      getNoteTemplates(),
      getConti(),
      getOrariLavoro(),
      getChiusure(),
      getTipiAttivita(),
      getLineeCredito(),
      getAnticipi(),
    ])

  // Quanti anticipi porterebbe via la cancellazione di una linea (ON DELETE CASCADE).
  const conteggioAnticipi: Record<string, number> = {}
  for (const a of anticipi) {
    conteggioAnticipi[a.linea_id] = (conteggioAnticipi[a.linea_id] ?? 0) + 1
  }

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

      <Tabs defaultValue="dati" className="gap-6">
        <TabsList>
          <TabsTrigger value="dati">Dati</TabsTrigger>
          <TabsTrigger value="produzione">Produzione</TabsTrigger>
          <TabsTrigger value="banca">Banca</TabsTrigger>
          <TabsTrigger value="altro">Preventivi e altro</TabsTrigger>
        </TabsList>

        {/* ── Dati: chi è l'azienda, logo e firma compresi ── */}
        <TabsContent value="dati" className="space-y-6">

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

        </TabsContent>

        {/* ── Produzione: quando si lavora e cosa si programma ── */}
        <TabsContent value="produzione" className="space-y-6">

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

      {/* Giorni di chiusura */}
      <Card>
        <CardHeader>
          <CardTitle>Giorni di chiusura</CardTitle>
          <CardDescription>
            Festività, ponti e ferie. Nel calendario diventano righe rosse su cui
            non si possono collocare attività.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormChiusure chiusure={chiusure} />
        </CardContent>
      </Card>

      {/* Attività del calendario */}
      <Card>
        <CardHeader>
          <CardTitle>Attività del calendario</CardTitle>
          <CardDescription>
            Nome e colore di ogni attività, dove compare e se colora il riquadro
            del giorno nel calendario di produzione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormTipiAttivita tipi={tipiAttivita} />
        </CardContent>
      </Card>

        </TabsContent>

        {/* ── Banca: conti, fidi e linee di credito ── */}
        <TabsContent value="banca" className="space-y-6">

      {/* Conti correnti */}
      <Card>
        <CardHeader>
          <CardTitle>Conti correnti</CardTitle>
          <CardDescription>
            Banche/conti su cui vengono addebitate le scadenze. La disponibilità (fido incluso)
            concorre alla liquidità nei Calcoli; il fido accordato serve a capire quanta parte
            di quella disponibilità è debito verso la banca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormConti initialConti={conti} />
        </CardContent>
      </Card>

      {/* Linee di credito */}
      <Card>
        <CardHeader>
          <CardTitle>Linee di credito</CardTitle>
          <CardDescription>
            Anticipo fatture, salvo buon fine, castelletto: qui si registra solo il plafond
            accordato. I singoli anticipi si inseriscono dai Calcoli, e da lì si ricavano
            utilizzato e disponibile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormLineeCredito initialLinee={linee} conteggioAnticipi={conteggioAnticipi} />
        </CardContent>
      </Card>

        </TabsContent>

        {/* ── Preventivi e altro: tutto il resto ── */}
        <TabsContent value="altro" className="space-y-6">

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

        </TabsContent>
      </Tabs>
    </div>
  )
}
