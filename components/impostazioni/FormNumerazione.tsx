'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveNumerazione } from '@/actions/impostazioni'
import { generaNumeroPreventivo } from '@/lib/numerazione'

interface Props {
  initialPrefisso: string | null
  initialOperatore: string | null
  initialPadding: number
  contatore: number
  anno: number
}

export default function FormNumerazione({
  initialPrefisso,
  initialOperatore,
  initialPadding,
  contatore,
  anno,
}: Props) {
  const [prefisso, setPrefisso] = useState(initialPrefisso ?? '')
  const [operatore, setOperatore] = useState(initialOperatore ?? '')
  const [padding, setPadding] = useState(initialPadding)
  const [isPending, startTransition] = useTransition()

  const currentYear = new Date().getFullYear()
  const annoAnteprima = anno > 0 ? anno : currentYear
  const prossimoContatore = anno !== currentYear ? 1 : contatore + 1

  const anteprima = prefisso.trim()
    ? generaNumeroPreventivo(
        prefisso,
        prossimoContatore,
        annoAnteprima,
        operatore || null,
        padding,
        'Mario Rossi'
      )
    : null

  const handleSave = () => {
    startTransition(async () => {
      try {
        await saveNumerazione({
          num_prefisso: prefisso || null,
          num_operatore: operatore || null,
          num_padding: padding,
        })
        toast.success('Numerazione salvata')
      } catch {
        toast.error('Errore nel salvataggio')
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {/* Campo 1 — Prefisso */}
        <div className="space-y-1.5">
          <Label>
            Campo 1 — Prefisso
            <span className="ml-1 text-xs text-gray-400 font-normal">(lettere/numeri)</span>
          </Label>
          <Input
            value={prefisso}
            onChange={(e) => setPrefisso(e.target.value.toUpperCase())}
            placeholder="es. PRE"
            maxLength={10}
            className="uppercase"
          />
        </div>

        {/* Campo 4 — Operatore */}
        <div className="space-y-1.5">
          <Label>
            Campo 4 — Operatore
            <span className="ml-1 text-xs text-gray-400 font-normal">(iniziale, facoltativo)</span>
          </Label>
          <Input
            value={operatore}
            onChange={(e) => setOperatore(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().charAt(0) || '')}
            placeholder="es. G"
            maxLength={1}
            className="uppercase w-20"
          />
        </div>

        {/* Padding cifre */}
        <div className="space-y-1.5">
          <Label>
            Cifre numero progressivo
            <span className="ml-1 text-xs text-gray-400 font-normal">(zeri iniziali)</span>
          </Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={padding}
            onChange={(e) => setPadding(Math.max(1, Math.min(5, parseInt(e.target.value) || 2)))}
            className="w-20"
          />
        </div>
      </div>

      {/* Info sui campi auto */}
      <div className="text-xs text-gray-500 space-y-0.5 bg-gray-50 rounded-md p-3">
        <p><span className="font-medium">Campo 2</span> — Numero progressivo: si incrementa ad ogni nuovo preventivo</p>
        <p><span className="font-medium">Campo 3</span> — Anno: anno di emissione, si azzera automaticamente a inizio anno</p>
        <p><span className="font-medium">Campo 5</span> — Cliente: nome del cliente del preventivo</p>
      </div>

      {/* Anteprima */}
      {anteprima ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-600 font-medium mb-1">Anteprima prossimo numero</p>
          <p className="font-mono text-sm font-semibold text-blue-800">{anteprima}</p>
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-400 italic">
            Imposta un prefisso per attivare la numerazione automatica.
            {' '}Se il prefisso è vuoto, il numero del preventivo dovrà essere inserito manualmente.
          </p>
        </div>
      )}

      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? 'Salvataggio...' : 'Salva numerazione'}
      </Button>
    </div>
  )
}
