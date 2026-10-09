import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { caricaParteDalServer } from '@/lib/conferme-ordine-db'
import { tipoFileFornitore } from '@/lib/conferme-ordine'

/**
 * Ripiego del caricamento diretto su Storage: il file passa dal server, a
 * pezzi (il corpo di una function Vercel si ferma a ~4,5 MB).
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
  const pezzo = form.get('file')
  if ((tipo !== 'conferma' && tipo !== 'documento') || !(pezzo instanceof Blob)) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const nome = String(form.get('nome') ?? '')
  const parte = Number(form.get('parte'))
  const totale = Number(form.get('totale'))
  if (parte === 0) {
    // Perche' la strada diretta non e' andata: serve a capire i problemi dei fornitori.
    console.warn('[file fornitore] ripiego dal server:', {
      token,
      nome,
      parti: totale,
      motivo: String(form.get('motivo') ?? '').slice(0, 300),
      ua: req.headers.get('user-agent'),
    })
  }

  const esito = await caricaParteDalServer(
    token,
    tipo,
    nome,
    tipoFileFornitore(nome, String(form.get('contentType') ?? '')),
    String(form.get('idCaricamento') ?? ''),
    parte,
    totale,
    await pezzo.arrayBuffer()
  )
  if (!esito.ok) {
    console.error('[file fornitore] ripiego non riuscito:', { token, nome, parte, errore: esito.errore })
    return NextResponse.json({ error: esito.errore }, { status: esito.status })
  }
  if (esito.completato) revalidatePath('/produzione', 'layout')
  return NextResponse.json({ ok: true, completato: esito.completato })
}
