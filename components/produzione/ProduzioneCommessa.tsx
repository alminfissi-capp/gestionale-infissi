'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Eye, Mail, Factory } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DialogOrdine from './DialogOrdine'
import DocumentiProduzione from './DocumentiProduzione'
import AttivitaCommessa from './AttivitaCommessa'
import GraficoAvanzamento from './GraficoAvanzamento'
import DialogVisualizzatore from './DialogVisualizzatore'
import OrdinePDF from './OrdinePDF'
import type { IntestazionePDF } from './OrdinePDF'
import StatoInvioOrdine from '@/components/produzione/StatoInvioOrdine'
import { useAttivitaCommessa } from '@/hooks/useAttivitaCommessa'
import { formatEuro } from '@/lib/pricing'
import { formattaNumeroOrdine, nomeFilePdfOrdine } from '@/lib/produzione'
import { deleteOrdine, setStatoOrdine } from '@/actions/produzione'
import { salvaPdfOrdine, aggiornaPdfDocumentoOrdine } from '@/actions/produzione-pdf'
import { getAllegatiOrdine } from '@/actions/produzione-allegati'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import { unisciAllegatiAlPdf, type AllegatoDaUnire } from '@/lib/produzione-allegati-pdf'
import { conFallbackInvio, righeFooterPdf, TRACKING_VUOTO } from '@/lib/produzione-tracking'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, StatoOrdine, TrackingOrdine } from '@/types/produzione'
import type { StatoCommessa, DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessa: { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa }
  ordini: OrdineCompleto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
  documenti: DocumentoCommessa[]
  intestazione: IntestazionePDF
  tracking: Record<string, TrackingOrdine>
  // Indirizzo di ritorno all'elenco economico, gia' deciso dal server: null per
  // chi non e' arrivato da li' o non ha accesso a quel modulo.
  tornaACommesse: string | null
}

export default function ProduzioneCommessa({
  commessa, ordini, fornitori, numeroProposto, documenti, intestazione, tracking, tornaACommesse,
}: Props) {
  const router = useRouter()
  // Attivita' e avanzamento vengono dallo stesso stato: l'anello si muove
  // nell'istante in cui si spunta "completata".
  const attivita = useAttivitaCommessa(commessa.id)
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)
  const [viewer, setViewer] = useState<{ url: string; nome: string } | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const emailFornitore = new Map(fornitori.map((f) => [f.id, f.email]))

  // Revoca l'ultimo object URL quando il componente viene smontato.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const inviaEmail = async (o: OrdineCompleto) => {
    if (!confirm('Inviare l\'ordine via email al fornitore?')) return
    const attesa = toast.loading('Invio in corso...')
    try {
      // Il PDF è l'allegato dell'email: se non esiste ancora viene creato adesso,
      // senza obbligare a passare prima dall'anteprima.
      const errorePdf = await assicuraPdf(o)
      if (errorePdf) {
        toast.dismiss(attesa)
        toast.error(`PDF non archiviato: ${errorePdf}`)
        router.refresh()
        return
      }

      const res = await fetch('/api/produzione/invia-ordine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordineId: o.id }),
      })
      const dati = (await res.json()) as {
        ok?: boolean; error?: string; inviatoAt?: string; destinatario?: string
      }
      toast.dismiss(attesa)
      if (!res.ok) toast.error(dati.error ?? 'Errore invio')
      else {
        toast.success('Ordine inviato al fornitore')
        if (dati.inviatoAt && dati.destinatario) {
          await riarchiviaConRicevuta(o, dati.inviatoAt, dati.destinatario)
        }
      }
    } catch (e) {
      toast.dismiss(attesa)
      toast.error(e instanceof Error ? e.message : 'Errore invio')
    }
    // Sempre: rilegge l'esito registrato sull'ordine, così l'avviso di fallimento
    // compare subito e sparisce da solo quando l'invio riesce.
    router.refresh()
  }

  // Scarica gli allegati dell'ordine come byte, per unirli al PDF.
  const scaricaAllegati = async (ordineId: string): Promise<AllegatoDaUnire[]> => {
    const allegati = await getAllegatiOrdine(ordineId)
    const risultati = await Promise.all(
      allegati.map(async (a): Promise<AllegatoDaUnire | null> => {
        const url = await getDocumentoSignedUrl(a.storage_path)
        if (!url) return null
        const resp = await fetch(url)
        if (!resp.ok) return null
        const bytes = await resp.arrayBuffer()
        return { nome: a.nome_file, bytes, contentType: a.content_type ?? '' }
      })
    )
    return risultati.filter((r): r is AllegatoDaUnire => r !== null)
  }

  /**
   * Renderizza il PDF dell'ordine e vi unisce gli allegati. `trackingPerPdf`
   * è `undefined` per la copia da archiviare (mai footer: è quella che
   * raggiungerà il fornitore) e valorizzato per la copia mostrata a video.
   * `avvisaAllegatiSaltati` evita il doppio toast quando si renderizza due volte.
   */
  const renderizzaPdf = async (
    o: OrdineCompleto,
    trackingPerPdf: TrackingOrdine | undefined,
    allegati: AllegatoDaUnire[],
    avvisaAllegatiSaltati: boolean
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const baseBlob = await pdf(
      <OrdinePDF
        ordine={o}
        intestazione={intestazione}
        fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
        numeroCommessa={commessa.numero_commessa}
        clienteNome={commessa.cliente_nome}
        tracking={trackingPerPdf}
      />
    ).toBlob()

    // Accoda gli allegati (foto/PDF) in fondo al documento.
    const baseBuffer = await baseBlob.arrayBuffer()
    let finaleBytes: Uint8Array = new Uint8Array(baseBuffer)
    if (allegati.length > 0) {
      const { bytes, saltati } = await unisciAllegatiAlPdf(baseBuffer, allegati)
      finaleBytes = bytes
      if (saltati.length > 0 && avvisaAllegatiSaltati) {
        toast.warning(`Allegati non inclusi (formato non supportato): ${saltati.join(', ')}`)
      }
    }
    // Copia ArrayBuffer-backed per Blob/Buffer (pdf-lib restituisce ArrayBufferLike).
    return new Uint8Array(finaleBytes)
  }

  /**
   * Garantisce che l'ordine abbia un PDF archiviato, generandolo se manca.
   * Restituisce il messaggio d'errore, oppure null se il PDF c'è o è stato creato.
   */
  const assicuraPdf = async (o: OrdineCompleto): Promise<string | null> => {
    if (o.pdf_path) return null
    const nomeFile = nomeFilePdfOrdine(o.numero_ordine, o.fornitore_nome, o.id)
    const allegati = await scaricaAllegati(o.id)
    // Copia da archiviare: mai il footer di tracking, è quella che va al fornitore.
    const archivioBytes = await renderizzaPdf(o, undefined, allegati, true)
    const base64 = Buffer.from(archivioBytes).toString('base64')
    const { error } = await salvaPdfOrdine(o.id, commessa.id, base64, nomeFile)
    return error ?? null
  }

  /**
   * Riscrive la copia in elenco documenti con la ricevuta dell'invio appena
   * fatto. Tocca solo quella: `pdf_path` resta la versione pulita già congelata
   * per il fornitore.
   */
  const riarchiviaConRicevuta = async (
    o: OrdineCompleto, inviatoAt: string, destinatario: string
  ) => {
    const t: TrackingOrdine = {
      ...TRACKING_VUOTO,
      stato: 'inviato',
      inviatoAt,
      destinatario,
      invii: (tracking[o.id]?.invii ?? 0) + 1,
    }
    const allegati = await scaricaAllegati(o.id)
    const conRicevuta = await renderizzaPdf(o, t, allegati, false)
    const nomeFile = nomeFilePdfOrdine(o.numero_ordine, o.fornitore_nome, o.id)
    const base64 = Buffer.from(conRicevuta).toString('base64')
    const { error } = await aggiornaPdfDocumentoOrdine(o.id, commessa.id, base64, nomeFile)
    if (error) console.warn('[ProduzioneCommessa] ricevuta non archiviata:', error)
  }

  const generaPdf = async (o: OrdineCompleto) => {
    const attesa = toast.loading('Generazione PDF in corso...')
    try {
      const nomeFile = nomeFilePdfOrdine(o.numero_ordine, o.fornitore_nome, o.id)
      const trackingOrdine = conFallbackInvio(tracking[o.id] ?? TRACKING_VUOTO, o.inviato_at)
      const allegati = await scaricaAllegati(o.id)

      // Copia da archiviare: sempre senza footer, è quella che finirà al fornitore.
      const archivioBytes = await renderizzaPdf(o, undefined, allegati, true)

      // Copia da mostrare: con footer solo se c'è già uno storico di invio da raccontare.
      const righeFooter = righeFooterPdf(trackingOrdine)
      const outBytes = righeFooter.length > 0
        ? await renderizzaPdf(o, trackingOrdine, allegati, false)
        : archivioBytes

      // Mostra il PDF completo nel visualizzatore in-app.
      const blob = new Blob([outBytes], { type: 'application/pdf' })
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      blobUrlRef.current = objectUrl
      setViewer({ url: objectUrl, nome: nomeFile })

      // Archivia e lega il PDF all'ordine: è la copia interna, quella del
      // fornitore viene congelata al momento dell'invio in pdf_inviato_path.
      // Se c'è una ricevuta da raccontare, l'elenco documenti riceve la copia
      // col footer, mentre pdf_path resta pulito per il fornitore.
      const base64 = Buffer.from(archivioBytes).toString('base64')
      const documentoBase64 = outBytes === archivioBytes
        ? undefined
        : Buffer.from(outBytes).toString('base64')
      const { error } = await salvaPdfOrdine(o.id, commessa.id, base64, nomeFile, documentoBase64)
      toast.dismiss(attesa)
      if (error) toast.error(`PDF mostrato ma non archiviato: ${error}`)
      else router.refresh()
    } catch (e) {
      toast.dismiss(attesa)
      toast.error(e instanceof Error ? e.message : 'Errore nella generazione del PDF')
    }
  }

  const cambiaStato = async (id: string, stato: StatoOrdine) => {
    try {
      await setStatoOrdine(id, stato)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  const elimina = async (id: string) => {
    if (!confirm('Eliminare questo ordine?')) return
    try {
      await deleteOrdine(id)
      toast.success('Ordine eliminato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center flex-wrap gap-2">
        {/* Chi arriva dall'elenco economico di solito vuole tornarci: il tasto
            compare solo in quel caso, ed e' il primo perche' e' la strada da
            cui si e' venuti. Chi entra da Produzione non lo vede mai. */}
        {tornaACommesse && (
          <Link href={tornaACommesse}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Commesse
            </Button>
          </Link>
        )}
        <Link href="/produzione">
          <Button variant={tornaACommesse ? 'outline' : 'ghost'} size="sm" className="gap-2">
            <Factory className="h-4 w-4" /> Produzione
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {commessa.numero_commessa || 'Commessa'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{commessa.cliente_nome}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ordini fornitore</h2>
          <Button size="sm" className="gap-2" onClick={() => { setInModifica(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> Nuovo ordine
          </Button>
        </div>

        {ordini.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessun ordine per questa commessa.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="p-2 font-medium">Numero</th>
                  <th className="p-2 font-medium">Fornitore</th>
                  <th className="p-2 font-medium">Consegna</th>
                  <th className="p-2 font-medium">Stato</th>
                  <th className="p-2 font-medium text-center">Invio</th>
                  <th className="p-2 font-medium text-right">Totale</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <Fragment key={o.id}>
                  <tr className="border-t border-gray-200 dark:border-gray-800">
                    <td className="p-2">{formattaNumeroOrdine(o.numero_ordine) || '—'}</td>
                    <td className="p-2">{o.fornitore_nome ?? '—'}</td>
                    <td className="p-2">
                      <span className={o.in_ritardo ? 'text-red-600 font-medium inline-flex items-center gap-1' : ''}>
                        {o.in_ritardo && <AlertTriangle className="h-3.5 w-3.5" />}
                        {o.data_consegna_prevista ?? '—'}
                      </span>
                    </td>
                    <td className="p-2">
                      <Select value={o.stato} onValueChange={(v) => cambiaStato(o.id, v as StatoOrdine)}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATI_ORDINE.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-center">
                      <StatoInvioOrdine tracking={tracking[o.id]} inviatoAt={o.inviato_at} />
                    </td>
                    <td className="p-2 text-right">{formatEuro(o.totale)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => generaPdf(o)} aria-label="Visualizza PDF">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {o.fornitore_id ? (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => inviaEmail(o)} aria-label="Invia email"
                          title={emailFornitore.get(o.fornitore_id)
                            ? 'Invia l\'ordine via email al fornitore'
                            : 'Il fornitore non ha un\'email in anagrafica'}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => { setInModifica(o); setOpen(true) }} aria-label="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600"
                        onClick={() => elimina(o.id)} aria-label="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  {o.errore_invio ? (
                    <tr>
                      <td colSpan={7} className="px-2 pb-2">
                        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                          <span>
                            <strong>Invio fallito</strong> — {o.errore_invio}
                            {o.errore_invio_at ? ` (${new Date(o.errore_invio_at).toLocaleString('it-IT')})` : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Documenti a tre quarti, anello di avanzamento nel quadrato accanto */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <DocumentiProduzione commessaId={commessa.id} documenti={documenti} />
        </div>
        <div className="lg:col-span-1">
          <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Avanzamento
            </h2>
            <GraficoAvanzamento
              avanzamento={attivita.avanzamento}
              dimensione={150}
              spessore={20}
              etichetta
            />
          </div>
        </div>
      </div>

      {/* Fasi di lavorazione programmate: le stesse righe del calendario */}
      <AttivitaCommessa
        commessaId={commessa.id}
        numeroCommessa={commessa.numero_commessa}
        clienteNome={commessa.cliente_nome}
        attivita={attivita}
      />

      <DialogOrdine
        open={open}
        onOpenChange={setOpen}
        commessaId={commessa.id}
        ordine={inModifica}
        fornitori={fornitori}
        numeroProposto={numeroProposto}
      />

      <DialogVisualizzatore
        url={viewer?.url ?? null}
        nome={viewer?.nome ?? ''}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}
