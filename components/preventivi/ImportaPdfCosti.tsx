'use client'

import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { parsePdfCosti } from '@/lib/parsePdfCosti'
import { formatEuro } from '@/lib/pricing'
import type { ArticoloWizard } from '@/types/preventivo'

interface Props {
  onImporta: (articoli: ArticoloWizard[]) => void
}

export default function ImportaPdfCosti({ onImporta }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Seleziona un file PDF')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()

      // Recupera organization_id per il path Storage
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utente non autenticato')
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      const orgId = profile?.organization_id as string

      // Parse PDF
      const voci = await parsePdfCosti(file)
      if (voci.length === 0) {
        toast.error('Nessuna voce trovata nel PDF')
        return
      }

      const articoli: ArticoloWizard[] = []

      for (const voce of voci) {
        let immagineUrl: string | null = null

        // Upload immagine finestra su Supabase Storage
        if (voce.immagineBlob) {
          const fileName = `${orgId}/pdf-import/${crypto.randomUUID()}.png`
          const { error: uploadErr } = await supabase.storage
            .from('preventivi-allegati')
            .upload(fileName, voce.immagineBlob, { contentType: 'image/png' })
          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('preventivi-allegati')
              .getPublicUrl(fileName)
            immagineUrl = urlData.publicUrl
          } else {
            console.warn('[ImportaPdfCosti] upload immagine fallito:', uploadErr.message)
          }
        }

        const pu = voce.imponibileUnitario
        const qty = voce.quantita
        const descrizione = voce.dimensione
          ? `${voce.tipologia} ${voce.dimensione}`
          : voce.tipologia
        const manodopera = voce.lavorazione + voce.posainopera

        const a: ArticoloWizard = {
          tempId: crypto.randomUUID(),
          tipo: 'libera',
          listino_id: null,
          listino_libero_id: null,
          prodotto_id: null,
          accessori_selezionati: null,
          accessori_griglia: null,
          tipologia: descrizione,
          categoria_nome: null,
          larghezza_mm: null,
          altezza_mm: null,
          larghezza_listino_mm: null,
          altezza_listino_mm: null,
          misura_arrotondata: false,
          finitura_nome: null,
          finitura_aumento: 0,
          finitura_aumento_euro: 0,
          note: manodopera > 0
            ? `Lav. ${formatEuro(voce.lavorazione)} + posa ${formatEuro(voce.posainopera)}`
            : null,
          immagine_url: immagineUrl,
          quantita: qty,
          prezzo_base: null,
          prezzo_unitario: pu,
          sconto_articolo: 0,
          prezzo_totale_riga: pu * qty,
          costo_acquisto_unitario: voce.materialeCosto,
          costo_posa: manodopera,
          aliquota_iva: voce.aliquotaIva,
          ordine: 0,
          bypass_calcolo: false,
          costo_prodotto_bypass: null,
          modalita_prezzo_bypass: null,
          percentuale_utile_bypass: null,
        }
        articoli.push(a)
      }

      onImporta(articoli)
      toast.success(`${articoli.length} voci importate dal PDF`)
    } catch (e) {
      console.error('[ImportaPdfCosti]', e)
      toast.error("Errore durante l'importazione del PDF")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50"
        title="Importa voci dal PDF costi WinStudio"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Importazione...
          </>
        ) : (
          <>
            <FileUp className="h-3.5 w-3.5" />
            Importa PDF costi
          </>
        )}
      </Button>
    </>
  )
}
