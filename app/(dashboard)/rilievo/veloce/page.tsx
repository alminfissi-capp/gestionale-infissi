import { redirect } from 'next/navigation'

// Il rilievo veloce e' diventato il rilievo in cantiere con le strutture di FP PRO.
export default function RilievoVelocePage() {
  redirect('/rilievo/cantiere')
}
