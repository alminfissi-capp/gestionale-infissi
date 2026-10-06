'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/ui/SignaturePad'
import { salvaTimbroFirmaConferme } from '@/actions/conferme-ordine'

interface Props {
  timbro: string | null
  firma: string | null
}

type Campo = 'timbro_conferme' | 'firma_conferme'

const leggiComeDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('File non leggibile'))
    r.readAsDataURL(file)
  })

/** Timbro e firma che il gestionale appone sulle conferme d'ordine dei fornitori. */
export default function TimbroFirmaConferme({ timbro: timbroIniziale, firma: firmaIniziale }: Props) {
  const [valori, setValori] = useState<Record<Campo, string | null>>({
    timbro_conferme: timbroIniziale,
    firma_conferme: firmaIniziale,
  })
  const [tracciata, setTracciata] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)

  const salva = async (campo: Campo, valore: string | null) => {
    setSalvataggio(true)
    try {
      await salvaTimbroFirmaConferme(campo, valore)
      setValori((v) => ({ ...v, [campo]: valore }))
      toast.success(valore ? 'Salvato' : 'Eliminato')
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
      return false
    } finally {
      setSalvataggio(false)
    }
  }

  const caricaFile = async (campo: Campo, file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Usa un\'immagine PNG o JPG')
      return
    }
    if (file.size > 700 * 1024) {
      toast.error('Immagine troppo grande: riducila sotto i 700 KB')
      return
    }
    await salva(campo, await leggiComeDataUrl(file))
  }

  const riquadro = (campo: Campo, titolo: string, descrizione: string) => {
    const valore = valori[campo]
    const inputId = `carica-${campo}`
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{titolo}</p>
          <p className="text-xs text-muted-foreground">{descrizione}</p>
        </div>
        <div className="flex h-20 items-center justify-center rounded-md border bg-white">
          {valore ? (
            <img src={valore} alt={titolo} className="max-h-16 max-w-[90%] object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Nessuna immagine</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-accent"
          >
            <Upload className="h-3.5 w-3.5" /> {valore ? 'Sostituisci' : 'Carica immagine'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={salvataggio}
            onChange={(e) => { void caricaFile(campo, e.target.files?.[0]); e.target.value = '' }}
          />
          {valore ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-red-600"
              disabled={salvataggio}
              onClick={() => { if (confirm(`Eliminare ${titolo.toLowerCase()}?`)) void salva(campo, null) }}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {riquadro('timbro_conferme', 'Timbro', 'PNG o JPG, meglio su sfondo bianco o trasparente.')}
        {riquadro('firma_conferme', 'Firma', 'Carica un\'immagine o tracciala qui sotto.')}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Oppure traccia la firma con il dito o il mouse:</p>
        <SignaturePad onChange={setTracciata} />
        <Button
          type="button"
          size="sm"
          disabled={!tracciata || salvataggio}
          onClick={async () => { if (tracciata && await salva('firma_conferme', tracciata)) setTracciata(null) }}
        >
          Usa questa firma
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sulla conferma vanno timbro, firma e data del giorno, uno sotto l&apos;altro. Il bianco di fondo diventa trasparente, così non copre il modulo del fornitore.
      </p>
    </div>
  )
}
