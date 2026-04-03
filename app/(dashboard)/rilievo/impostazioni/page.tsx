import { getForme } from '@/actions/rilievo'
import { getOpzioni } from '@/actions/rilievo-veloce'
import ImpostazioniRilievo from '@/components/rilievo/ImpostazioniRilievo'

export const metadata = { title: 'Impostazioni Rilievo' }

export default async function ImpostazioniRilievoPage() {
  const [forme, opzioniVeloce] = await Promise.all([
    getForme(),
    getOpzioni(),
  ])
  return <ImpostazioniRilievo forme={forme} opzioniVeloce={opzioniVeloce} />
}
