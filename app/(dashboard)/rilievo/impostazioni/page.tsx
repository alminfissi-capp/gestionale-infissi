import { getForme } from '@/actions/rilievo'
import ImpostazioniRilievo from '@/components/rilievo/ImpostazioniRilievo'

export const metadata = { title: 'Forme Serramento — Rilievo' }

export default async function ImpostazioniRilievoPage() {
  const forme = await getForme()
  return <ImpostazioniRilievo forme={forme} />
}
