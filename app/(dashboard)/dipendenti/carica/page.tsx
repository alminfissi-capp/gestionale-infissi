import { getDipendenti } from '@/actions/dipendenti'
import PaginaCarica from '@/components/dipendenti/PaginaCarica'

export const dynamic = 'force-dynamic'

export default async function CaricaDocumentiPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; dip?: string }>
}) {
  const { tipo, dip } = await searchParams
  const dipendenti = await getDipendenti()
  const tipoIniziale = tipo === 'bonifico' ? 'bonifico' : 'busta'
  const dipendenteIniziale = dipendenti.some((d) => d.id === dip) ? dip! : null
  return (
    <PaginaCarica
      dipendenti={dipendenti}
      tipoIniziale={tipoIniziale}
      dipendenteIniziale={dipendenteIniziale}
    />
  )
}
