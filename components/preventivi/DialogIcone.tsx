'use client'

import { useState } from 'react'
import { Images, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { urlIcona } from '@/lib/icone-preventivo'
import type { IconaPreventivo } from '@/types/impostazioni'

interface Props {
  icone: IconaPreventivo[]
  /** URL dell'immagine gia' scelta, per segnare quale icona e' quella in uso. */
  urlSelezionato: string | null
  onSelect: (icona: IconaPreventivo) => void
}

/**
 * Le icone caricate in Impostazioni, in una finestra a griglia.
 *
 * In finestra e non in linea nel form: le icone sono destinate a diventare
 * tante, e una griglia con la ricerca si sfoglia, mentre una striscia nel form
 * lo allungherebbe e basta.
 */
export default function DialogIcone({ icone, urlSelezionato, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [ricerca, setRicerca] = useState('')

  if (icone.length === 0) return null

  const filtrate = ricerca.trim()
    ? icone.filter((i) => i.nome.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : icone

  const scegli = (icona: IconaPreventivo) => {
    onSelect(icona)
    setOpen(false)
    setRicerca('')
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Images className="h-3.5 w-3.5" />
        Icone
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scegli un&apos;icona</DialogTitle>
            <DialogDescription>
              Le immagini caricate in Impostazioni. Si aggiungono da Impostazioni → Preventivi e
              altro.
            </DialogDescription>
          </DialogHeader>

          {icone.length > 8 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                autoFocus
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                placeholder="Cerca per nome..."
                className="pl-8 h-9"
              />
            </div>
          )}

          {filtrate.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nessuna icona con questo nome.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filtrate.map((icona) => {
                const url = urlIcona(icona.storage_path)
                const scelta = urlSelezionato === url
                return (
                  <button
                    key={icona.id}
                    type="button"
                    onClick={() => scegli(icona)}
                    title={icona.nome}
                    className={`rounded border p-1.5 transition-colors ${
                      scelta ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    { }
                    <img
                      src={url}
                      alt={icona.nome}
                      style={{ width: '100%', height: 56, objectFit: 'contain' }}
                    />
                    <span className="block truncate text-[11px] text-gray-600 mt-1">
                      {icona.nome}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
