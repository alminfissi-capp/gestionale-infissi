'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnagraficaProdotto } from '@/types/magazzino'
import { TIPOLOGIA_LABELS, MATERIALE_LABELS, type TipologiaESP, type MaterialeESP } from '@/types/catalogo-esp'

const PAGE_SIZE = 50

type Props = {
  prodotti: AnagraficaProdotto[]
  totale: number
  pagina: number
}

export default function TabellaCatalogoESP({ prodotti, totale, pagina }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const totalePagine = Math.ceil(totale / PAGE_SIZE)

  function navPagina(p: number) {
    const np = new URLSearchParams(params.toString())
    np.set('pagina', String(p))
    router.push(`${pathname}?${np.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{totale.toLocaleString('it-IT')} articoli trovati</span>
        {totalePagine > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={pagina <= 1} onClick={() => navPagina(pagina - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Pag. {pagina} / {totalePagine}</span>
            <Button variant="outline" size="icon" disabled={pagina >= totalePagine} onClick={() => navPagina(pagina + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Codice</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead className="w-28">Tipologia</TableHead>
              <TableHead className="w-28">Materiale</TableHead>
              <TableHead className="w-16">U.M.</TableHead>
              <TableHead className="w-24">Prezzo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prodotti.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  Nessun articolo trovato con i filtri selezionati
                </TableCell>
              </TableRow>
            )}
            {prodotti.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.codice}</TableCell>
                <TableCell className="text-sm">{p.nome}</TableCell>
                <TableCell>
                  {p.tipologia ? (
                    <Badge variant="outline" className="text-xs">
                      {TIPOLOGIA_LABELS[p.tipologia as TipologiaESP] ?? p.tipologia}
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  {p.materiale ? (
                    <Badge variant="secondary" className="text-xs">
                      {MATERIALE_LABELS[p.materiale as MaterialeESP] ?? p.materiale}
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.unita_misura}</TableCell>
                <TableCell className="text-sm">
                  {p.prezzo_acquisto != null ? `€ ${p.prezzo_acquisto.toFixed(2)}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
