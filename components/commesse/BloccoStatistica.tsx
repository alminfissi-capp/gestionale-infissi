'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  titolo: string
  /** Testo sotto al titolo, quando il blocco ha bisogno di una precisazione. */
  sottotitolo?: React.ReactNode
  primo: boolean
  ultimo: boolean
  onSu: () => void
  onGiu: () => void
  children: React.ReactNode
}

/**
 * Un blocco della pagina statistiche, con le frecce per spostarlo.
 *
 * Frecce e non trascinamento: un riquadro alto 400px trascinato lungo una pagina
 * lunga e' scomodo, soprattutto da tablet, mentre una freccia e' precisa anche
 * col dito.
 */
export default function BloccoStatistica({
  titolo, sottotitolo, primo, ultimo, onSu, onGiu, children,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">{titolo}</CardTitle>
            {sottotitolo}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={primo}
              aria-label={`Sposta "${titolo}" in su`}
              onClick={onSu}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={ultimo}
              aria-label={`Sposta "${titolo}" in giù`}
              onClick={onGiu}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
