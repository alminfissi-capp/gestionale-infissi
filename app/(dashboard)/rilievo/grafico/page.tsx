import { redirect } from 'next/navigation'

// Il rilievo grafico ora e' una voce "disegnata" dentro il rilievo in cantiere.
export default function RilievoGraficoPage() {
  redirect('/rilievo/cantiere')
}
