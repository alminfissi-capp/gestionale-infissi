'use client'

import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { parsePdfCosti } from '@/lib/parsePdfCosti'
import type { ArticoloWizard } from '@/types/preventivo'

interface Props {
  onImporta: (articoli: ArticoloWizard[]) => void
  onPdfFile?: (file: File) => void
}

// Upload immagini a gruppi: in serie 50 voci significano 50 attese consecutive
const UPLOAD_PARALLELI = 6

export default function ImportaPdfCosti({ onImporta, onPdfFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Seleziona un file PDF')
      return
    }
    setLoading(true)
    setProgresso('Apertura PDF...')
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
      const voci = await parsePdfCosti(file, (p) => {
        setProgresso(`Lettura pagina ${p.pagina}/${p.totale} — ${p.voci} voci`)
      })
      if (voci.length === 0) {
        toast.error('Nessuna voce trovata nel PDF')
        return
      }

      // Immagini caricate in parallelo a gruppi, con progresso
      const conImmagine = voci.filter((v) => v.immagineBlob)
      const urlPerVoce = new Map<number, string>()
      let caricate = 0
      let fallite = 0
      setProgresso(`Caricamento immagini 0/${conImmagine.length}`)

      for (let i = 0; i < voci.length; i += UPLOAD_PARALLELI) {
        const gruppo = voci.slice(i, i + UPLOAD_PARALLELI)
        await Promise.all(
          gruppo.map(async (voce, j) => {
            if (!voce.immagineBlob) return
            const idx = i + j
            const fileName = `${orgId}/pdf-import/${crypto.randomUUID()}.png`
            try {
              const { error: uploadErr } = await supabase.storage
                .from('preventivi-allegati')
                .upload(fileName, voce.immagineBlob, { contentType: 'image/png' })
              if (uploadErr) throw new Error(uploadErr.message)
              const { data: urlData } = supabase.storage
                .from('preventivi-allegati')
                .getPublicUrl(fileName)
              urlPerVoce.set(idx, urlData.publicUrl)
            } catch (e) {
              // L'immagine è un di più: la voce si importa comunque
              fallite++
              console.warn('[ImportaPdfCosti] upload immagine fallito:', e)
            } finally {
              caricate++
              setProgresso(`Caricamento immagini ${caricate}/${conImmagine.length}`)
            }
          })
        )
      }

      const articoli: ArticoloWizard[] = []

      for (const [indice, voce] of voci.entries()) {
        const immagineUrl = urlPerVoce.get(indice) ?? null

        const pu = voce.imponibileUnitario
        const qty = voce.quantita
        const descrizione = voce.dimensione
          ? `${voce.tipologia} ${voce.dimensione}`
          : voce.tipologia
        const manodopera = voce.lavorazione + voce.posainopera

        // Costruisce nota con dettagli tecnici estratti dal PDF
        const dettagli: string[] = []
        if (voce.profili) dettagli.push(`Profili: ${voce.profili}`)
        if (voce.trattEsterno) dettagli.push(`Est.: ${voce.trattEsterno}`)
        if (voce.trattInterno) dettagli.push(`Int.: ${voce.trattInterno}`)
        if (voce.trattAccessori) dettagli.push(`Acc.: ${voce.trattAccessori}`)
        if (voce.vetri) dettagli.push(`Vetri: ${voce.vetri}`)
        const note = dettagli.length > 0 ? dettagli.join('\n') : null

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
          note,
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
      onPdfFile?.(file)
      toast.success(
        fallite > 0
          ? `${articoli.length} voci importate — ${fallite} immagini non caricate`
          : `${articoli.length} voci importate dal PDF`
      )
    } catch (e) {
      console.error('[ImportaPdfCosti]', e)
      toast.error("Errore durante l'importazione del PDF")
    } finally {
      setLoading(false)
      setProgresso(null)
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
            {progresso ?? 'Importazione...'}
          </>
        ) : (
          <>
            <FileUp className="h-3.5 w-3.5" />
            Importa PDF costi FP-PRO
          </>
        )}
      </Button>
    </>
  )
}
