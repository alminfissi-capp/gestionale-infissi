'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveGiorniValidita } from '@/actions/impostazioni'

interface Props {
  initialGiorni: number
}

export default function FormValiditaPreventivo({ initialGiorni }: Props) {
  const [giorni, setGiorni] = useState(initialGiorni)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    startTransition(async () => {
      try {
        await saveGiorniValidita(giorni)
        toast.success('Validità salvata')
      } catch {
        toast.error('Errore nel salvataggio')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 max-w-xs">
        <Label>Giorni di validità</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={365}
            value={giorni}
            onChange={(e) => setGiorni(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24"
          />
          <span className="text-sm text-gray-500">giorni</span>
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 rounded-md p-3">
        Un preventivo in stato <strong>Inviato</strong> viene marcato automaticamente come{' '}
        <strong>Scaduto</strong> se rimane in quello stato per più di {giorni}{' '}
        {giorni === 1 ? 'giorno' : 'giorni'} dalla data di invio.
        Gli stati <strong>Accettato</strong> e <strong>Rifiutato</strong> non vengono mai sovrascritti.
      </p>

      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? 'Salvataggio...' : 'Salva'}
      </Button>
    </div>
  )
}
