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

  // Segna come visualizzato al primo accesso
  if (!prev.visualizzato_at) {
    await supabase
      .from('preventivi')
      .update({ visualizzato_at: new Date().toISOString() })
      .eq('share_token', token)
  }

  return { ...prev, articoli: articoli ?? [] }
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
