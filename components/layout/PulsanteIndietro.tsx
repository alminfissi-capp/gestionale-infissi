'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Pulsante "Indietro" ben visibile per le sottopagine: torna alla schermata da cui
 * si è arrivati (scheda commessa, Produzione…). Se la pagina è stata aperta da un
 * link diretto e non c'è niente dietro nella cronologia, va a `fallback`.
 */
export default function PulsanteIndietro({ fallback, etichetta = 'Indietro' }: { fallback: string; etichetta?: string }) {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(fallback)
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      {etichetta}
    </Button>
  )
}
