import { getSerie } from '@/actions/winconfig'
import { requireAccesso } from '@/lib/permessi'
import SerieListClient from '@/components/winconfig/SerieListClient'

export const dynamic = 'force-dynamic'

export default async function WinConfigPage() {
  await requireAccesso('winconfig')
  const serie = await getSerie()
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SerieListClient serie={serie} />
    </div>
  )
}
