import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { createServiceClient } from '@/lib/supabase/service'
import StampaPreventivo from '@/components/preventivi/StampaPreventivo'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

interface Props {
  params: Promise<{ token: string }>
}

async function getPreventivoByToken(token: string): Promise<PreventivoCompleto | null> {
  const supabase = createPublicClient()
  const { data: prev, error } = await supabase
    .from('preventivi')
    .select('*')
    .eq('share_token', token)
    .single()

  if (error || !prev) return null

  const { data: articoli } = await supabase
    .from('articoli_preventivo')
    .select('*')
    .eq('preventivo_id', prev.id)
    .order('ordine')

  // Aggiorna ad ogni accesso (mostra sempre l'ultimo)
  await supabase
    .from('preventivi')
    .update({ visualizzato_at: new Date().toISOString() })
    .eq('share_token', token)

  // Recupera dati cataloghi allegati tramite service client:
  // - la tabella cataloghi non ha policy pubblica (client anon non può leggerla)
  // - il bucket potrebbe essere privato → si usano URL firmati come per il logo
  const ids: string[] = prev.cataloghi_allegati ?? []
  let cataloghi_allegati_data: { id: string; nome: string; url: string }[] = []
  if (ids.length > 0) {
    const service = createServiceClient()
    const { data: cats } = await service
      .from('cataloghi')
      .select('id, nome, storage_path')
      .in('id', ids)
    if (cats) {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const cat = cats.find((c) => c.id === id)
          if (!cat) return null
          const { data: signed } = await service.storage
            .from('cataloghi-brochure')
            .createSignedUrl(cat.storage_path, 3600)
          if (!signed?.signedUrl) return null
          return { id: cat.id, nome: cat.nome, url: signed.signedUrl }
        })
      )
      cataloghi_allegati_data = entries.filter(Boolean) as { id: string; nome: string; url: string }[]
    }
  }

  return { ...prev, articoli: articoli ?? [], cataloghi_allegati_data, allegati_calcoli_data: [] }
}

async function getSettingsPubblici(orgId: string): Promise<Settings | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const preventivo = await getPreventivoByToken(token)
  if (!preventivo) return { title: 'Preventivo' }
  const s = preventivo.cliente_snapshot
  const nomeCliente =
    s.tipo === 'azienda'
      ? s.ragione_sociale || s.email || s.telefono || ''
      : [s.nome, s.cognome].filter(Boolean).join(' ') || s.email || s.telefono || ''
  const title = preventivo.numero
    ? `${preventivo.numero} ${nomeCliente}`.trim()
    : nomeCliente || 'Preventivo'
  return { title }
}

export default async function PreventivoPublicoPage({ params }: Props) {
  const { token } = await params
  const preventivo = await getPreventivoByToken(token)
  if (!preventivo) notFound()

  const settings = await getSettingsPubblici(preventivo.organization_id)

  let logoUrl: string | null = null
  if (settings?.logo_url) {
    const service = createServiceClient()
    const { data } = await service.storage
      .from('logos')
      .createSignedUrl(settings.logo_url, 3600)
    logoUrl = data?.signedUrl ?? null
  }

  return (
    <StampaPreventivo
      preventivo={preventivo}
      settings={settings}
      logoUrl={logoUrl}
      showBack={false}
    />
  )
}
