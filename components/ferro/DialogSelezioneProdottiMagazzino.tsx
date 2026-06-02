'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Link2 } from 'lucide-react'

export type ProdottoMagazzino = {
  id: string
  codice: string
  descrizione: string
  prezzo_acquisto: number | null
  categoria_nome: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  linkedIds: string[]
  onConfirm: (prodotti: ProdottoMagazzino[]) => void
}

export default function DialogSelezioneProdottiMagazzino({ open, onClose, linkedIds, onConfirm }: Props) {
  const [prodotti, setProdotti] = useState<ProdottoMagazzino[]>([])
  const [loading, setLoading] = useState(false)
  const [cerca, setCerca] = useState('')
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setSelezionati(new Set())
    setCerca('')
    const load = async () => {
      setLoading(true)
      const db = createClient()
      const { data } = await db
        .from('catalogo_articoli')
        .select('id, codice, descrizione, prezzo_acquisto, categorie_magazzino(nome)')
        .order('descrizione')
      if (data) {
        setProdotti(data.map(p => ({
          id: p.id,
          codice: p.codice,
          descrizione: p.descrizione,
          prezzo_acquisto: p.prezzo_acquisto,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoria_nome: (p.categorie_magazzino as any)?.nome ?? null,
        })))
      }
      setLoading(false)
    }
    load()
  }, [open])

  const filtrati = useMemo(() => {
    const q = cerca.toLowerCase()
    if (!q) return prodotti
    return prodotti.filter(p =>
      p.descrizione.toLowerCase().includes(q) ||
      p.codice.toLowerCase().includes(q) ||
      (p.categoria_nome ?? '').toLowerCase().includes(q)
    )
  }, [prodotti, cerca])

  const toggle = (id: string) => {
    if (linkedIds.includes(id)) return
    setSelezionati(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const scelti = prodotti.filter(p => selezionati.has(p.id))
    onConfirm(scelti)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Aggiungi da magazzino
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Cerca per codice, descrizione o categoria..."
          value={cerca}
          onChange={e => setCerca(e.target.value)}
          className="mt-2"
        />

        <div className="flex-1 overflow-auto mt-2 rounded-md border">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Caricamento...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Codice</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Prezzo acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrati.map(p => {
                  const giàAggiunto = linkedIds.includes(p.id)
                  const checked = selezionati.has(p.id)
                  return (
                    <TableRow
                      key={p.id}
                      className={giàAggiunto ? 'opacity-40' : 'cursor-pointer hover:bg-muted/50'}
                      onClick={() => toggle(p.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          disabled={giàAggiunto}
                          onCheckedChange={() => toggle(p.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.codice}</TableCell>
                      <TableCell className="font-medium">
                        {p.descrizione}
                        {giàAggiunto && <Badge variant="secondary" className="ml-2 text-xs">Già aggiunto</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.categoria_nome ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.prezzo_acquisto != null ? `€ ${Number(p.prezzo_acquisto).toFixed(2)}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtrati.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nessun prodotto trovato
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="mt-4">
          <span className="text-sm text-muted-foreground mr-auto">
            {selezionati.size > 0 ? `${selezionati.size} selezionati` : 'Nessuna selezione'}
          </span>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={selezionati.size === 0} onClick={handleConfirm}>
            Aggiungi selezionati
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
