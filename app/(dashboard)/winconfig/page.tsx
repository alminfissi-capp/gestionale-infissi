import { getSerie } from '@/actions/winconfig'
import SerieListClient from '@/components/winconfig/SerieListClient'

export const dynamic = 'force-dynamic'

export default async function WinConfigPage() {
  const serie = await getSerie()
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SerieListClient serie={serie} />
    </div>
  )
}
