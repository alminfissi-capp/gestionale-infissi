'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, Search } from 'lucide-react'

/** Prodotto del catalogo scelto per precompilare una riga d'ordine. */
export type ArticoloScelto = {
  id: string
  codice: string
  descrizione: string
  um: string
  prezzo_acquisto: number | null
}

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (articoli: ArticoloScelto[]) => void
}

const LIMIT = 60

export default function DialogSelezioneArticolo({ open, onClose, onConfirm }: Props) {
  const [prodotti, setProdotti] = useState<ArticoloScelto[]>([])
  const [loading, setLoading] = useState(false)
  const [cerca, setCerca] = useState('')
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = cerca.trim()

    debounceRef.current = setTimeout(async () => {
      if (q.length < 2) {
        setProdotti([])
        return
      }
      setLoading(true)
      const db = createClient()

      const { data } = await db
        .from('catalogo_articoli')
        .select('id, codice, descrizione, um, prezzo_acquisto')
        .or(`descrizione.ilike.%${q}%,codice.ilike.%${q}%`)
        .order('descrizione')
        .limit(LIMIT)

      if (data) {
        setProdotti(
          data.map((p) => ({
            id: p.id,
            codice: p.codice,
            descrizione: p.descrizione,
            um: p.um ?? '',
            prezzo_acquisto: p.prezzo_acquisto,
          }))
        )
      }
      setLoading(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [cerca, open])

  const reset = () => {
    setSelezionati(new Set())
    setCerca('')
    setProdotti([])
  }

  const chiudi = () => {
    reset()
    onClose()
  }

  const toggle = (id: string) => {
    setSelezionati((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const scelti = prodotti.filter((p) => selezionati.has(p.id))
    onConfirm(scelti)
    chiudi()
  }

  const showEmpty = cerca.trim().length >= 2 && !loading && prodotti.length === 0
  const showPrompt = cerca.trim().length < 2 && !loading

  return (
    <Dialog open={open} onOpenChange={(v) => !v && chiudi()}>
      <DialogContent className="sm:max-w-2xl xl:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Aggiungi da magazzino
          </DialogTitle>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per codice o descrizione (min. 2 caratteri)..."
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-auto mt-2 rounded-md border">
          {loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">Ricerca in corso...</div>
          )}
          {showPrompt && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Digita almeno 2 caratteri per cercare nel catalogo
            </div>
          )}
          {showEmpty && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nessun prodotto trovato per &quot;{cerca}&quot;
            </div>
          )}
          {!loading && prodotti.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Codice</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>U.M.</TableHead>
                  <TableHead className="text-right">Prezzo acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodotti.map((p) => {
                  const checked = selezionati.has(p.id)
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggle(p.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(p.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.codice}</TableCell>
                      <TableCell className="font-medium">{p.descrizione}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.um || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.prezzo_acquisto != null ? `€ ${Number(p.prezzo_acquisto).toFixed(2)}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
          {prodotti.length === LIMIT && (
            <span>Mostrati i primi {LIMIT} risultati — affina la ricerca per trovare altri</span>
          )}
          {prodotti.length > 0 && prodotti.length < LIMIT && (
            <span>{prodotti.length} risultati</span>
          )}
          {prodotti.length === 0 && <span />}
        </div>

        <DialogFooter className="mt-2">
          <span className="text-sm text-muted-foreground mr-auto">
            {selezionati.size > 0 ? `${selezionati.size} selezionati` : 'Nessuna selezione'}
          </span>
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button disabled={selezionati.size === 0} onClick={handleConfirm}>
            Aggiungi selezionati
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
