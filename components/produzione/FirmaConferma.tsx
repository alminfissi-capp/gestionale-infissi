'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, Loader2, PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import DialogVisualizzatore from './DialogVisualizzatore'
import { createClient } from '@/lib/supabase/client'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { formattaDataOra } from '@/lib/produzione-tracking'
import {
  cartellaFileFornitore, limitaPosizione, posizioneProposta, type PosizioneFirma,
} from '@/lib/conferme-ordine'
import { componiTimbro, confermaComePdf, firmaPdf, type TimbroComposto } from '@/lib/firma-conferma-pdf'
import type { DatiFirmaConferma } from '@/actions/conferme-ordine'

type Props = { dati: DatiFirmaConferma }

/** Posizione salvata: l'altezza si ricava dal rapporto del timbro e della pagina. */
type Ancora = { x: number; y: number; larghezza: number }

type Trascinamento = {
  modo: 'sposta' | 'ridimensiona'
  inizioX: number
  inizioY: number
  partenza: PosizioneFirma
}

const oggi = () =>
  new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date())

export default function FirmaConferma({ dati }: Props) {
  const router = useRouter()
  const { conferma, ordine } = dati
  const daFirmare = conferma.stato === 'da_firmare'
  const numero = formattaNumeroOrdine(ordine.numero_ordine)

  const [pdf, setPdf] = useState<Uint8Array | null>(null)
  const [numPagine, setNumPagine] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [rapportoPagina, setRapportoPagina] = useState<number | null>(null)
  const [larghezzaArea, setLarghezzaArea] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const [timbro, setTimbro] = useState<TimbroComposto | null>(null)
  const [ancora, setAncora] = useState<Ancora | null>(null)
  const [note, setNote] = useState('')
  const [invio, setInvio] = useState(false)
  const [anteprima, setAnteprima] = useState<string | null>(null)

  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trascinamento = useRef<Trascinamento | null>(null)
  // pdf.js: il documento caricato, riusato per cambiare pagina.
  const documentoRef = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)

  const senzaFirma = !dati.firma
  const posizione: PosizioneFirma | null =
    ancora && timbro && rapportoPagina
      ? limitaPosizione({ ...ancora, altezza: (ancora.larghezza * timbro.rapporto) / rapportoPagina })
      : null

  // Larghezza dell'area di disegno, in stato: il render non legge le ref.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const osserva = new ResizeObserver(([voce]) => setLarghezzaArea(Math.floor(voce.contentRect.width)))
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])

  // Scarica la conferma e la porta a PDF (le foto diventano una pagina).
  useEffect(() => {
    if (!daFirmare || !dati.urlConferma) return
    let annullato = false
    void (async () => {
      try {
        const resp = await fetch(dati.urlConferma as string)
        if (!resp.ok) throw new Error('File della conferma non disponibile')
        const bytes = await confermaComePdf(await resp.arrayBuffer(), conferma.content_type ?? 'application/pdf')
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        // pdf.js si prende il buffer che riceve: gli si passa una copia.
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
        if (annullato) return
        documentoRef.current = doc
        setPdf(bytes)
        setNumPagine(doc.numPages)
        // Lo spazio "timbro e firma" sta quasi sempre in fondo all'ultima pagina.
        setPagina(doc.numPages - 1)
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : 'Conferma non leggibile')
      }
    })()
    return () => { annullato = true }
  }, [daFirmare, dati.urlConferma, conferma.content_type])

  // Timbro + firma + data, composti una volta.
  useEffect(() => {
    if (!daFirmare || senzaFirma) return
    let annullato = false
    componiTimbro(dati.timbro, dati.firma, oggi())
      .then((t) => { if (!annullato) setTimbro(t) })
      .catch(() => { if (!annullato) setErrore('Timbro o firma non leggibili: ricaricali in Impostazioni') })
    return () => { annullato = true }
  }, [daFirmare, senzaFirma, dati.timbro, dati.firma])

  // Disegna la pagina scelta alla larghezza dell'area.
  useEffect(() => {
    const doc = documentoRef.current
    const canvas = canvasRef.current
    if (!pdf || !doc || !canvas || larghezzaArea === 0) return
    let annullato = false
    let compito: { cancel: () => void } | null = null
    void (async () => {
      const page = await doc.getPage(pagina + 1)
      if (annullato) return
      const base = page.getViewport({ scale: 1 })
      const scala = larghezzaArea / base.width
      const densita = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scala * densita })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${larghezzaArea}px`
      canvas.style.height = `${Math.floor(viewport.height / densita)}px`
      setRapportoPagina(base.height / base.width)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const render = page.render({ canvasContext: ctx, viewport, canvas })
      compito = render
      await render.promise.catch(() => { /* annullato da un nuovo disegno */ })
    })()
    return () => {
      annullato = true
      compito?.cancel()
    }
  }, [pdf, pagina, larghezzaArea])

  // Prima posizione proposta, appena si conoscono timbro e pagina.
  useEffect(() => {
    if (ancora || !timbro || !rapportoPagina) return
    const p = posizioneProposta(timbro.rapporto, rapportoPagina)
    setAncora({ x: p.x, y: p.y, larghezza: p.larghezza })
  }, [ancora, timbro, rapportoPagina])

  const iniziaTrascinamento = (modo: Trascinamento['modo']) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!posizione) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    trascinamento.current = { modo, inizioX: e.clientX, inizioY: e.clientY, partenza: posizione }
  }

  const trascina = (e: ReactPointerEvent<HTMLElement>) => {
    const t = trascinamento.current
    if (!t || !timbro || !rapportoPagina || larghezzaArea === 0) return
    const altezzaArea = larghezzaArea * rapportoPagina
    const dx = (e.clientX - t.inizioX) / larghezzaArea
    const dy = (e.clientY - t.inizioY) / altezzaArea
    if (t.modo === 'sposta') {
      const p = limitaPosizione({ ...t.partenza, x: t.partenza.x + dx, y: t.partenza.y + dy })
      setAncora({ x: p.x, y: p.y, larghezza: p.larghezza })
    } else {
      const larghezza = Math.min(Math.max(t.partenza.larghezza + dx, 0.12), 0.8)
      setAncora({ x: t.partenza.x, y: t.partenza.y, larghezza })
    }
  }

  const fineTrascinamento = () => { trascinamento.current = null }

  const generaFirmato = async (): Promise<Uint8Array<ArrayBuffer>> => {
    if (!pdf || !posizione || !timbro) throw new Error('Conferma non ancora pronta')
    return firmaPdf(pdf, pagina, posizione, timbro.dataUrl)
  }

  const mostraAnteprima = async () => {
    try {
      const bytes = await generaFirmato()
      if (anteprima) URL.revokeObjectURL(anteprima)
      setAnteprima(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Anteprima non riuscita')
    }
  }

  const firmaEInvia = async () => {
    if (!ordine.fornitore_email) {
      toast.error('Il fornitore non ha un indirizzo email in anagrafica')
      return
    }
    setInvio(true)
    const attesa = toast.loading('Firma e invio in corso...')
    try {
      const bytes = await generaFirmato()
      // Il PDF va su Storage dal browser: dentro la richiesta non passerebbe sopra i ~4,5 MB.
      const path = `${cartellaFileFornitore(conferma.organization_id, ordine.id)}firmata-${Date.now()}.pdf`
      const { error: upError } = await createClient()
        .storage.from('commesse-docs')
        .upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf' })
      if (upError) throw new Error(`PDF firmato non caricato: ${upError.message}`)

      const res = await fetch('/api/produzione/invia-conferma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confermaId: conferma.id, path, note }),
      })
      const esito = (await res.json().catch(() => ({}))) as { error?: string; destinatario?: string }
      toast.dismiss(attesa)
      if (!res.ok) {
        toast.error(esito.error ?? 'Invio non riuscito')
        setInvio(false)
        return
      }
      toast.success(`Conferma firmata inviata a ${esito.destinatario ?? 'fornitore'}`)
      router.push(ordine.commessa_id ? `/produzione/${ordine.commessa_id}` : '/produzione')
      router.refresh()
    } catch (e) {
      toast.dismiss(attesa)
      toast.error(e instanceof Error ? e.message : 'Invio non riuscito')
      setInvio(false)
    }
  }

  const altezzaArea = rapportoPagina && larghezzaArea ? larghezzaArea * rapportoPagina : 0

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href={ordine.commessa_id ? `/produzione/${ordine.commessa_id}` : '/produzione'}>
            <ArrowLeft className="h-4 w-4" /> {ordine.commessa_id ? 'Commessa' : 'Produzione'}
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Conferma d&apos;ordine · {numero}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {ordine.fornitore_nome ?? 'Fornitore non indicato'}
          {ordine.numero_commessa ? ` · commessa ${ordine.numero_commessa}` : ''}
          {ordine.cliente_nome ? ` · ${ordine.cliente_nome}` : ''}
          {` · caricata il ${formattaDataOra(conferma.created_at)}`}
        </p>
        {dati.altreVersioni.length > 0 ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Il fornitore ha caricato {dati.altreVersioni.length + 1} versioni: questa è la{' '}
            {dati.altreVersioni.some((v) => v.created_at > conferma.created_at) ? 'precedente' : 'più recente'}.
          </p>
        ) : null}
      </div>

      {!daFirmare ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-2 text-sm">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {conferma.stato === 'sostituita'
              ? 'Il fornitore ha caricato una conferma più recente: questa non va più firmata.'
              : conferma.stato === 'firmata_manuale'
                ? 'Conferma firmata, caricata a mano.'
                : `Conferma firmata il ${formattaDataOra(conferma.firmata_at)}.`}
          </p>
          {conferma.inviata_a ? (
            <p className="text-gray-600 dark:text-gray-400">
              Inviata a {conferma.inviata_a} il {formattaDataOra(conferma.inviata_at)}
              {conferma.letta_at ? ` · letta il ${formattaDataOra(conferma.letta_at)}` : ' · non ancora letta'}
            </p>
          ) : null}
          {conferma.note_firma ? (
            <p className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">Note: {conferma.note_firma}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {dati.urlFirmata ? (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={dati.urlFirmata} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Apri la conferma firmata
                </a>
              </Button>
            ) : null}
            {dati.urlConferma && conferma.storage_path !== conferma.firmata_path ? (
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <a href={dati.urlConferma} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Originale del fornitore
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {senzaFirma ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Manca la firma aziendale. Caricala in{' '}
                <Link href="/impostazioni" className="font-medium underline">Impostazioni → Produzione</Link>{' '}
                e torna qui.
              </span>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Il tuo ordine</h2>
                {dati.urlOrdine ? (
                  <a href={dati.urlOrdine} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                    <ExternalLink className="h-3.5 w-3.5" /> Apri
                  </a>
                ) : null}
              </div>
              {dati.urlOrdine ? (
                <iframe src={dati.urlOrdine} title={`Ordine ${numero}`}
                  className="h-[60vh] lg:h-[78vh] w-full rounded-md border border-gray-200 dark:border-gray-800 bg-white" />
              ) : (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
                  PDF dell&apos;ordine non disponibile.
                </p>
              )}
            </section>

            <section className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Conferma del fornitore
                </h2>
                <div className="flex items-center gap-1">
                  {numPagine > 1 ? (
                    <>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Pagina precedente"
                        disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
                        Pagina {pagina + 1} di {numPagine}
                      </span>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Pagina successiva"
                        disabled={pagina >= numPagine - 1} onClick={() => setPagina((p) => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                  {dati.urlConferma ? (
                    <a href={dati.urlConferma} target="_blank" rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                      <ExternalLink className="h-3.5 w-3.5" /> Apri
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[78vh] overflow-y-auto rounded-md border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900">
                <div ref={areaRef} className="relative w-full" style={{ height: altezzaArea || undefined }}>
                  <canvas ref={canvasRef} className={pdf ? 'block bg-white' : 'hidden'} />
                  {!pdf && !errore ? (
                    <div className="flex h-64 items-center justify-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Caricamento della conferma...
                    </div>
                  ) : null}
                  {errore ? (
                    <div className="m-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{errore}</div>
                  ) : null}
                  {posizione && timbro && pdf ? (
                    <div
                      role="img"
                      aria-label="Timbro e firma: trascina per spostarli"
                      onPointerDown={iniziaTrascinamento('sposta')}
                      onPointerMove={trascina}
                      onPointerUp={fineTrascinamento}
                      onPointerCancel={fineTrascinamento}
                      className="absolute cursor-move touch-none select-none rounded-sm outline-2 outline-dashed outline-[#0E8F9C] bg-[#0E8F9C]/5"
                      style={{
                        left: `${posizione.x * 100}%`,
                        top: `${posizione.y * 100}%`,
                        width: `${posizione.larghezza * 100}%`,
                        height: `${posizione.altezza * 100}%`,
                      }}
                    >
                      <img src={timbro.dataUrl} alt="" draggable={false} className="pointer-events-none h-full w-full" />
                      <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0E8F9C] px-2 py-0.5 text-[10px] text-white">
                        trascina
                      </span>
                      <span
                        aria-label="Ridimensiona"
                        onPointerDown={iniziaTrascinamento('ridimensiona')}
                        onPointerMove={trascina}
                        onPointerUp={fineTrascinamento}
                        onPointerCancel={fineTrascinamento}
                        className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-[#0E8F9C]"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Timbro, firma e data di oggi. Trascinali nel punto giusto; l&apos;angolo in basso a destra cambia la dimensione.
              </p>
            </section>
          </div>

          <div className="space-y-2 max-w-3xl">
            <Label htmlFor="note-conferma">Note per il fornitore</Label>
            <Textarea
              id="note-conferma"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Es. accettiamo la consegna al 24/10; sul prezzo vale quanto concordato."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Partono nella mail insieme alla conferma firmata
              {ordine.fornitore_email ? `, a ${ordine.fornitore_email}` : ''}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={firmaEInvia} disabled={invio || !posizione || !pdf || senzaFirma} className="gap-2">
              {invio ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              Firma e invia al fornitore
            </Button>
            <Button variant="outline" onClick={mostraAnteprima} disabled={invio || !posizione || !pdf} className="gap-2">
              <Eye className="h-4 w-4" /> Anteprima firmata
            </Button>
          </div>
        </>
      )}

      <DialogVisualizzatore
        url={anteprima}
        nome={`Conferma firmata ${numero}.pdf`}
        onClose={() => {
          if (anteprima) URL.revokeObjectURL(anteprima)
          setAnteprima(null)
        }}
      />
    </div>
  )
}
