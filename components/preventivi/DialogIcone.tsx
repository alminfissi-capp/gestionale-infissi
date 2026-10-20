'use client'

import { useState } from 'react'
import { ArrowLeft, ChevronRight, Images, Search } from 'lucide-react'
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
import { urlArchivio } from '@/lib/archivio-immagini'
import type { ArchivioCategoriaConImmagini, IconaPreventivo } from '@/types/impostazioni'

/** Immagine scelta: nome e URL dell'originale (la voce poi ne salva una copia) */
export interface ImmagineScelta { nome: string; url: string }

interface Props {
  icone: IconaPreventivo[]
  archivio: ArchivioCategoriaConImmagini[]
  /** URL dell'immagine scelta adesso, per segnarla nella griglia */
  urlSelezionato: string | null
  onSelect: (immagine: ImmagineScelta) => void
}

const ICONE = '__icone__'

function RigaCategoria({ nome, quante, anteprima, onClick }: { nome: string; quante: number; anteprima: string | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-md border border-gray-200 p-2 text-left hover:border-gray-400 hover:bg-gray-50">
      {anteprima
        ? <img src={anteprima} alt="" className="h-10 w-12 shrink-0 rounded bg-gray-50 object-contain" />
        : <span className="h-10 w-12 shrink-0 rounded bg-gray-100" />}
      <span className="min-w-0 flex-1 truncate font-medium">{nome}</span>
      <span className="text-xs text-gray-500">{quante}</span>
      <ChevronRight className="h-4 w-4 text-gray-400" />
    </button>
  )
}

/**
 * "Icone / Archivio": prima l'elenco delle categorie (Icone in cima, poi quelle
 * dell'archivio), poi la griglia della categoria scelta.
 */
export default function DialogIcone({ icone, archivio, urlSelezionato, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [categoria, setCategoria] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState('')

  const categorie = archivio.filter(c => c.immagini.length > 0)
  if (icone.length === 0 && categorie.length === 0) return null

  const elementi: { id: string; nome: string; url: string }[] = categoria === ICONE
    ? icone.map(i => ({ id: i.id, nome: i.nome, url: urlIcona(i.storage_path) }))
    : (archivio.find(c => c.id === categoria)?.immagini ?? []).map(i => ({ id: i.id, nome: i.nome, url: urlArchivio(i.storage_path) }))
  const q = ricerca.trim().toLowerCase()
  const filtrati = q ? elementi.filter(e => e.nome.toLowerCase().includes(q)) : elementi
  const titolo = categoria === ICONE ? 'Icone' : archivio.find(c => c.id === categoria)?.nome ?? ''

  const apri = (id: string | null) => { setCategoria(id); setRicerca('') }
  const scegli = (e: { nome: string; url: string }) => {
    onSelect({ nome: e.nome, url: e.url })
    setOpen(false)
    apri(null)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => { apri(null); setOpen(true) }}>
        <Images className="h-3.5 w-3.5" />
        Icone / Archivio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{categoria ? titolo : 'Icone / Archivio'}</DialogTitle>
            <DialogDescription>
              {categoria
                ? 'Tocca un\'immagine: la voce ne salva una copia, il preventivo non cambia se poi modifichi l\'archivio.'
                : 'Scegli una categoria. Si gestiscono in Impostazioni.'}
            </DialogDescription>
          </DialogHeader>

          {categoria === null ? (
            <div className="space-y-2">
              {icone.length > 0 && (
                <RigaCategoria key={ICONE} onClick={() => apri(ICONE)} nome="Icone" quante={icone.length} anteprima={urlIcona(icone[0].storage_path)} />
              )}
              {categorie.map(c => (
                <RigaCategoria key={c.id} onClick={() => apri(c.id)} nome={c.nome} quante={c.immagini.length} anteprima={urlArchivio(c.immagini[0].storage_path)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => apri(null)}>
                <ArrowLeft className="h-3.5 w-3.5" />Categorie
              </Button>
              {elementi.length > 8 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input autoFocus value={ricerca} onChange={e => setRicerca(e.target.value)} placeholder="Cerca per nome..." className="h-9 pl-8" />
                </div>
              )}
              {filtrati.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Nessuna immagine con questo nome.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {filtrati.map(e => (
                    <button key={e.id} type="button" onClick={() => scegli(e)} title={e.nome}
                      className={`rounded border p-1.5 transition-colors ${urlSelezionato === e.url ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-400'}`}>
                      <img src={e.url} alt={e.nome} style={{ width: '100%', height: 56, objectFit: 'contain' }} />
                      <span className="mt-1 block truncate text-[11px] text-gray-600">{e.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
