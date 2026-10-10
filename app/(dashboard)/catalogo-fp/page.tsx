import { requireAccesso } from '@/lib/permessi'
import { getCatalogoFpStato, getSerieFp } from '@/actions/catalogo-fp'
import CatalogoFpClient from '@/components/catalogo-fp/CatalogoFpClient'

export const dynamic = 'force-dynamic'

export default async function CatalogoFpPage() {
  await requireAccesso('rilievo')
  const [stato, serie] = await Promise.all([getCatalogoFpStato(), getSerieFp()])
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <CatalogoFpClient statoIniziale={stato} serie={serie} />
    </div>
  )
}
