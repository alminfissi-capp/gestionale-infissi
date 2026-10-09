'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salvaTimbroConferme } from '@/actions/conferme-ordine'

const leggiComeDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('File non leggibile'))
    r.readAsDataURL(file)
  })

/** Il timbro con la firma che il gestionale appone sulle conferme d'ordine dei fornitori. */
export default function TimbroConferme({ timbro: timbroIniziale }: { timbro: string | null }) {
  const [timbro, setTimbro] = useState<string | null>(timbroIniziale)
  const [salvataggio, setSalvataggio] = useState(false)

  const salva = async (valore: string | null) => {
    setSalvataggio(true)
    try {
      await salvaTimbroConferme(valore)
      setTimbro(valore)
      toast.success(valore ? 'Salvato' : 'Eliminato')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSalvataggio(false)
    }
  }

  const caricaFile = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Usa un\'immagine PNG o JPG')
      return
    }
    if (file.size > 700 * 1024) {
      toast.error('Immagine troppo grande: riducila sotto i 700 KB')
      return
    }
    await salva(await leggiComeDataUrl(file))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border p-3 sm:max-w-sm">
        <div>
          <p className="text-sm font-medium">Timbro con firma</p>
          <p className="text-xs text-muted-foreground">PNG o JPG, meglio su sfondo bianco o trasparente.</p>
        </div>
        <div className="flex h-28 items-center justify-center rounded-md border bg-white">
          {timbro ? (
            <img src={timbro} alt="Timbro con firma" className="max-h-24 max-w-[90%] object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Nessuna immagine</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor="carica-timbro-conferme"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-accent"
          >
            <Upload className="h-3.5 w-3.5" /> {timbro ? 'Sostituisci' : 'Carica immagine'}
          </label>
          <input
            id="carica-timbro-conferme"
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={salvataggio}
            onChange={(e) => { void caricaFile(e.target.files?.[0]); e.target.value = '' }}
          />
          {timbro ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-red-600"
              disabled={salvataggio}
              onClick={() => { if (confirm('Eliminare il timbro?')) void salva(null) }}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Sulla conferma vanno il timbro e, sotto, la data del giorno. Il bianco di fondo diventa trasparente, così non copre il modulo del fornitore.
      </p>
    </div>
  )
}
