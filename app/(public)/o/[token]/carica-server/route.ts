import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { caricaDalServer } from '@/lib/conferme-ordine-db'
import { tipoFileFornitore } from '@/lib/conferme-ordine'

/**
 * Ripiego del caricamento diretto su Storage: il file passa dal server.
 * Solo per file piccoli (il corpo di una function Vercel si ferma a ~4,5 MB).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const tipo = form.get('tipo')
  const file = form.get('file')
  if ((tipo !== 'conferma' && tipo !== 'documento') || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const nome = String(form.get('nome') ?? '')
  // Perche' la strada diretta non e' andata: serve a capire i problemi dei fornitori.
  console.warn('[file fornitore] ripiego dal server:', {
    token,
    nome,
    motivo: String(form.get('motivo') ?? '').slice(0, 300),
    ua: req.headers.get('user-agent'),
  })

  const esito = await caricaDalServer(
    token, tipo, nome, tipoFileFornitore(nome, file.type), await file.arrayBuffer()
  )
  if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status })
  revalidatePath('/produzione', 'layout')
  return NextResponse.json({ ok: true })
}
