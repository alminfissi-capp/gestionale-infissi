'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Link2, Search } from 'lucide-react'

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

const LIMIT = 60

export default function DialogSelezioneProdottiMagazzino({ open, onClose, linkedIds, onConfirm }: Props) {
  const [risultati, setRisultati] = useState<ProdottoMagazzino[]>([])
  const [loading, setLoading] = useState(false)
  const [cerca, setCerca] = useState('')
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())

  // Sotto i due caratteri non si cerca, e i risultati di prima non devono
  // restare a schermo. Derivato dal testo cercato invece che azzerato in un
  // effetto: non c'e' un frame in cui si vedono risultati che non c'entrano.
  const prodotti = cerca.trim().length < 2 ? [] : risultati
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Il dialog resta montato fra un'apertura e l'altra: senza questo si
  // riaprirebbe con la ricerca e le spunte di prima. Fatto durante il render,
  // cosi' la prima pittura mostra gia' il dialog pulito.
  const [eraAperto, setEraAperto] = useState(open)
  if (eraAperto !== open) {
    setEraAperto(open)
    if (open) {
      setSelezionati(new Set())
      setCerca('')
      setRisultati([])
    }
  }

  // Server-side search with debounce
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // I risultati vecchi li nasconde gia' `prodotti`, qui basta non cercare.
    if (cerca.trim().length < 2) return

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const db = createClient()
      const q = cerca.trim()

      const { data } = await db
        .from('catalogo_articoli')
        .select('id, codice, descrizione, prezzo_acquisto, categorie_magazzino(nome)')
        .or(`descrizione.ilike.%${q}%,codice.ilike.%${q}%`)
        .order('descrizione')
        .limit(LIMIT)

      if (data) {
        setRisultati(data.map(p => ({
          id: p.id,
          codice: p.codice,
          descrizione: p.descrizione,
          prezzo_acquisto: p.prezzo_acquisto,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoria_nome: (p.categorie_magazzino as any)?.nome ?? null,
        })))
      }
      setLoading(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [cerca, open])

  const toggle = (id: string) => {
    if (linkedIds.includes(id)) return
    setSelezionati(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const scelti = prodotti.filter(p => selezionati.has(p.id))
    onConfirm(scelti)
    onClose()
  }

  const showEmpty = cerca.trim().length >= 2 && !loading && prodotti.length === 0
  const showPrompt = cerca.trim().length < 2 && !loading

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl xl:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Aggiungi da magazzino
          </DialogTitle>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per codice o descrizione (min. 2 caratteri)..."
            value={cerca}
            onChange={e => setCerca(e.target.value)}
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
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Prezzo acquisto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodotti.map(p => {
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
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={selezionati.size === 0} onClick={handleConfirm}>
            Aggiungi selezionati
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
