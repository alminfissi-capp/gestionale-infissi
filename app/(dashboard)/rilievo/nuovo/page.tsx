import { redirect } from 'next/navigation'

// Il vecchio rilievo grafico (vani + canvas) e' stato sostituito dal rilievo grafico come FP PRO.
export default function NuovoRilievoPage() {
  redirect('/rilievo/grafico')
}
