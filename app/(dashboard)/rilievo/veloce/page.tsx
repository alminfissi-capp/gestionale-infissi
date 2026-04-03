import { getRilievi } from '@/actions/rilievo-veloce'
import RilievoVeloceList from '@/components/rilievo/RilievoVeloceList'

export const metadata = { title: 'Rilievo Veloce' }

export default async function RilievoVelocePage() {
  const rilievi = await getRilievi()
  return <RilievoVeloceList rilievi={rilievi} />
}
