// components/impostazioni/FormOrariLavoro.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { setOrariLavoro } from '@/actions/calendario'
import { GIORNI_SETTIMANA } from '@/types/calendario'
import type { OrariLavoro, OrarioGiorno } from '@/types/calendario'

export default function FormOrariLavoro({ iniziali }: { iniziali: OrariLavoro }) {
  const router = useRouter()
  const [orari, setOrari] = useState<OrariLavoro>(iniziali)
  const [loading, setLoading] = useState(false)

  const aggiorna = (indice: number, patch: Partial<OrarioGiorno>) => {
    setOrari((prec) => prec.map((g, i) => (i === indice ? { ...g, ...patch } : g)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const invalido = orari.find((g) => g.aperto && g.chiusura <= g.apertura)
    if (invalido) {
      toast.error('La chiusura deve venire dopo l’apertura')
      return
    }
    setLoading(true)
    try {
      await setOrariLavoro(orari)
      toast.success('Orari salvati')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {orari.map((giorno, i) => (
        <div key={GIORNI_SETTIMANA[i]} className="flex items-center gap-3">
          <div className="w-28 text-sm text-gray-700 dark:text-gray-300">
            {GIORNI_SETTIMANA[i]}
          </div>
          <Switch
            checked={giorno.aperto}
            onCheckedChange={(aperto) => aggiorna(i, { aperto })}
            aria-label={`${GIORNI_SETTIMANA[i]} aperto`}
          />
          {giorno.aperto ? (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={giorno.apertura}
                onChange={(e) => aggiorna(i, { apertura: e.target.value })}
                className="w-32"
              />
              <span className="text-gray-400">→</span>
              <Input
                type="time"
                value={giorno.chiusura}
                onChange={(e) => aggiorna(i, { chiusura: e.target.value })}
                className="w-32"
              />
            </div>
          ) : (
            <span className="text-sm text-gray-400">chiuso</span>
          )}
        </div>
      ))}

      <Button type="submit" disabled={loading}>
        {loading ? 'Salvataggio…' : 'Salva orari'}
      </Button>
    </form>
  )
}
