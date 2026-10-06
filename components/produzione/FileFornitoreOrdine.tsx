'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, PenLine, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getUrlFileFornitore, registraConfermaManuale } from '@/actions/conferme-ordine'
import {
  cartellaFileFornitore, ETICHETTE_STATO_CONFERMA, nomeFileSicuro, riepilogaConferma, validaFileFornitore,
} from '@/lib/conferme-ordine'
import { formattaDataOra } from '@/lib/produzione-tracking'
import type { FileFornitoreOrdine as FileFornitore } from '@/types/produzione'

interface Props {
  ordine: { id: string; organization_id: string; richiede_conferma: boolean }
  file: FileFornitore[]
}

const COLORI = {
  non_richiesta: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  in_attesa: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  da_firmare: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  firmata: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  firmata_manuale: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
} as const

/** Sotto la riga dell'ordine: stato della conferma e file arrivati dal fornitore. */
export default function FileFornitoreOrdine({ ordine, file }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [caricamento, setCaricamento] = useState(false)
  const { stato, conferma } = riepilogaConferma(ordine.richiede_conferma, file)
  const documenti = file.filter((f) => f.tipo === 'documento')
  const inputId = `conferma-manuale-${ordine.id}`

  const apri = async (path: string) => {
    // La finestra si apre subito, nel click: dopo l'attesa i browser la bloccherebbero.
    const finestra = window.open('', '_blank')
    const url = await getUrlFileFornitore(path)
    if (!url) {
      finestra?.close()
      toast.error('File non disponibile')
      return
    }
    if (finestra) finestra.location.href = url
    else window.location.href = url
  }

  const caricaManuale = async (f: File | undefined) => {
    if (!f) return
    const contentType = f.type || 'application/octet-stream'
    const errore = validaFileFornitore(contentType, f.size)
    if (errore) { toast.error(errore); return }
    setCaricamento(true)
    try {
      const path = `${cartellaFileFornitore(ordine.organization_id, ordine.id)}${Date.now()}-manuale-${nomeFileSicuro(f.name)}`
      // Direttamente su Storage: in una Server Action i file grandi non passerebbero.
      const { error } = await createClient().storage.from('commesse-docs').upload(path, f, { contentType })
      if (error) throw new Error(error.message)
      const esito = await registraConfermaManuale(ordine.id, {
        path, nome: f.name, contentType, dimensione: f.size,
      })
      if (esito.error) throw new Error(esito.error)
      toast.success('Conferma firmata archiviata')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caricamento non riuscito')
    } finally {
      setCaricamento(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {stato !== 'non_richiesta' && (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${COLORI[stato]}`}>
          Conferma: {ETICHETTE_STATO_CONFERMA[stato]}
        </span>
      )}

      {stato === 'da_firmare' && conferma && (
        <Button asChild size="sm" className="h-7 gap-1.5 bg-red-600 px-2.5 text-xs hover:bg-red-700">
          <Link href={`/produzione/conferme/${conferma.id}`}>
            <PenLine className="h-3.5 w-3.5" /> Firma
          </Link>
        </Button>
      )}

      {stato === 'firmata' && conferma && (
        <>
          <span className="text-gray-500 dark:text-gray-400">
            {conferma.inviata_at ? `inviata il ${formattaDataOra(conferma.inviata_at)}` : 'non inviata'}
            {conferma.letta_at ? ` · letta il ${formattaDataOra(conferma.letta_at)}` : conferma.inviata_at ? ' · non ancora letta' : ''}
          </span>
          <Link href={`/produzione/conferme/${conferma.id}`} className="text-[#0E8F9C] hover:underline">
            Dettagli
          </Link>
        </>
      )}

      {stato === 'firmata_manuale' && conferma?.firmata_path && (
        <button type="button" onClick={() => apri(conferma.firmata_path as string)}
          className="text-[#0E8F9C] hover:underline">
          Apri
        </button>
      )}

      {documenti.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => apri(d.storage_path)}
          title={`Caricato dal fornitore il ${formattaDataOra(d.created_at)}`}
          className="inline-flex max-w-56 items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{d.nome_file}</span>
        </button>
      ))}

      {(stato === 'in_attesa' || stato === 'da_firmare') && (
        <>
          <label
            htmlFor={inputId}
            title="Se l'hai già firmata e mandata tu: viene solo archiviata, non parte nessuna email"
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 ${caricamento ? 'pointer-events-none opacity-60' : ''}`}
          >
            {caricamento ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Carica conferma già firmata
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => void caricaManuale(e.target.files?.[0])}
          />
        </>
      )}
    </div>
  )
}
