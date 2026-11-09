'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import SceltaFp, { type VoceScelta } from './SceltaFp'
import { colori, coloriUguali, eBicolore, toglieBicolore } from '@/lib/colore-unico'
import type { RifFp } from '@/types/rilievo-fp'

interface Props {
  int: RifFp | null | undefined
  est: RifFp | null | undefined
  voci: VoceScelta[]
  preferiti?: Set<string>
  onStella?: (v: VoceScelta, attiva: boolean) => void
  onCambia: (c: { coloreInt: RifFp | null; coloreEst: RifFp | null }) => void
}

const rif = (x: VoceScelta | null): RifFp | null => (x ? { fpId: Number(x.id), descrizione: x.testo } : null)

/**
 * Colore del serramento: un campo solo (stesso colore dentro e fuori). "Bicolore" fa comparire
 * interno ed esterno separati; "Colore unico" torna a uno solo (vale l'interno).
 */
export default function SceltaColore({ int, est, voci, preferiti, onStella, onCambia }: Props) {
  const [bicolore, setBicolore] = useState(() => eBicolore(int, est))
  const campo = (etichetta: string, valore: RifFp | null | undefined, scegli: (c: RifFp | null) => void) => (
    <div className="space-y-1">
      <Label className="text-xs">{etichetta}</Label>
      <SceltaFp
        voci={voci}
        preferiti={preferiti}
        onStella={onStella}
        valore={valore ? String(valore.fpId) : null}
        segnaposto="Cerca colore (es. 9010)"
        etichettaNessuno="Non indicato"
        riserva={valore ? { id: String(valore.fpId), testo: valore.descrizione } : null}
        onScegli={x => scegli(rif(x))}
      />
    </div>
  )
  return (
    <div className="space-y-2">
      {bicolore ? (
        <>
          {campo('Colore interno', int, c => onCambia({ coloreInt: c, coloreEst: est ?? null }))}
          {campo('Colore esterno', est, c => onCambia({ coloreInt: int ?? null, coloreEst: c }))}
        </>
      ) : (
        campo('Colore', int ?? est, c => onCambia(colori(c)))
      )}
      <Button type="button" variant="outline" size="sm" className="w-full"
        onClick={() => {
          if (bicolore) {
            const nuovo = toglieBicolore(int, est)
            // Gia' uguali dentro e fuori: niente modifica (la voce non diventa "piu' recente")
            if (!coloriUguali({ coloreInt: int, coloreEst: est }, nuovo)) onCambia(nuovo)
          }
          setBicolore(!bicolore)
        }}>
        {bicolore ? 'Colore unico (uguale dentro e fuori)' : 'Bicolore (interno ed esterno diversi)'}
      </Button>
    </div>
  )
}
