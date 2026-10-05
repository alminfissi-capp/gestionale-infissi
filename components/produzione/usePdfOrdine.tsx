'use client'

import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import OrdinePDF from './OrdinePDF'
import DialogVisualizzatore from './DialogVisualizzatore'
import { getOrdinePerPdf } from '@/actions/produzione'
import { getAllegatiOrdine } from '@/actions/produzione-allegati'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import { unisciAllegatiAlPdf, type AllegatoDaUnire } from '@/lib/produzione-allegati-pdf'
import { nomeFilePdfOrdine } from '@/lib/produzione'

/**
 * Apre il PDF di un ordine partendo dal solo id (es. da un evento del calendario).
 * Lo genera ogni volta con i dati attuali, come il pulsante "Vedi" dell'elenco
 * ordini, senza il footer di tracking e senza archiviarlo: e' solo da guardare.
 */
export function usePdfOrdine() {
  const [viewer, setViewer] = useState<{ url: string; nome: string } | null>(null)

  const chiudi = () => {
    if (viewer) URL.revokeObjectURL(viewer.url)
    setViewer(null)
  }

  const apri = async (ordineId: string) => {
    const attesa = toast.loading('Apertura PDF dell’ordine…')
    try {
      const dati = await getOrdinePerPdf(ordineId)
      if (!dati) {
        toast.dismiss(attesa)
        toast.error('Ordine non trovato: forse è stato eliminato')
        return
      }
      const { ordine, intestazione } = dati
      const allegati = await scaricaAllegati(ordineId)
      const base = await pdf(
        <OrdinePDF
          ordine={ordine}
          intestazione={intestazione}
          fornitoreNome={ordine.fornitore_nome ?? 'Fornitore non indicato'}
          numeroCommessa={ordine.commessa_id ? (ordine.numero_commessa || 'Commessa') : 'Magazzino'}
          clienteNome={ordine.commessa_id ? (ordine.cliente_nome || '') : ''}
        />
      ).toBlob()
      const buffer = await base.arrayBuffer()
      let bytes: Uint8Array = new Uint8Array(buffer)
      if (allegati.length > 0) {
        const unito = await unisciAllegatiAlPdf(buffer, allegati)
        bytes = unito.bytes
      }
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
      if (viewer) URL.revokeObjectURL(viewer.url)
      setViewer({ url, nome: nomeFilePdfOrdine(ordine.numero_ordine, ordine.fornitore_nome, ordine.id) })
      toast.dismiss(attesa)
    } catch (e) {
      toast.dismiss(attesa)
      toast.error(e instanceof Error ? e.message : 'Errore nell’apertura del PDF')
    }
  }

  const visualizzatore = (
    <DialogVisualizzatore url={viewer?.url ?? null} nome={viewer?.nome ?? ''} onClose={chiudi} />
  )

  return { apri, visualizzatore }
}

async function scaricaAllegati(ordineId: string): Promise<AllegatoDaUnire[]> {
  const allegati = await getAllegatiOrdine(ordineId)
  const risultati = await Promise.all(
    allegati.map(async (a): Promise<AllegatoDaUnire | null> => {
      const url = await getDocumentoSignedUrl(a.storage_path)
      if (!url) return null
      const resp = await fetch(url)
      if (!resp.ok) return null
      return { nome: a.nome_file, bytes: await resp.arrayBuffer(), contentType: a.content_type ?? '' }
    })
  )
  return risultati.filter((r): r is AllegatoDaUnire => r !== null)
}
