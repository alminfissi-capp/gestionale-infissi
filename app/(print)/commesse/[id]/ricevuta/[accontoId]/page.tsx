import { notFound } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'
import type { Metadata } from 'next'
import { getCommessaById } from '@/actions/commesse'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import RicevutaAcconto from '@/components/commesse/RicevutaAcconto'

interface Props {
  params: Promise<{ id: string; accontoId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, accontoId } = await params
  const commessa = await getCommessaById(id)
  if (!commessa) return { title: 'Ricevuta' }
  const acconto = commessa.acconti.find((a) => a.id === accontoId)
  if (!acconto) return { title: 'Ricevuta' }

  const ref = acconto.id.slice(-6).toUpperCase()
  const [y, m, d] = acconto.data_pagamento.split('-')
  const data = `${d}.${m}.${y.slice(2)}`
  const nome = commessa.cliente_nome || ''

  return { title: `Ric.n ${ref} - ${nome} - ${data}` }
}

export default async function RicevutaAccontoPage({ params }: Props) {
  // La ricevuta mostra cliente, importo e saldo: stesso permesso dell'elenco.
  await requireAccesso('commesse')
  const { id, accontoId } = await params

  const [commessa, settings] = await Promise.all([
    getCommessaById(id),
    getSettings(),
  ])

  if (!commessa) notFound()

  const acconto = commessa.acconti.find((a) => a.id === accontoId)
  if (!acconto) notFound()

  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

  return (
    <RicevutaAcconto
      commessa={commessa}
      acconto={acconto}
      settings={settings}
      logoUrl={logoUrl}
      firmaDefault={settings?.firma_default ?? null}
    />
  )
}
