'use client'

import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RiepilogoCollegamento } from '@/types/fatture-fornitori'

const COLORE = {
  nessuno: 'text-gray-300 hover:text-gray-600',
  non_scritto: 'text-sky-600',
  scritto: 'text-emerald-600',
  problema: 'text-rose-600',
} as const

export default function IconaFattureScadenza({
  riepilogo, onClick,
}: { riepilogo?: RiepilogoCollegamento; onClick: () => void }) {
  const stato = riepilogo?.stato ?? 'nessuno'
  const titolo = !riepilogo
    ? 'Collega alle fatture FiC'
    : stato === 'problema'
      ? `Problema con FiC: ${riepilogo.messaggio ?? 'apri per i dettagli'}`
      : stato === 'scritto' ? `Pagamento scritto su FiC (${riepilogo.n})` : `Collegata a ${riepilogo.n} documenti FiC`
  return (
    <Button variant="ghost" size="icon" className={`relative h-8 w-8 shrink-0 ${COLORE[stato]}`} title={titolo} onClick={onClick}>
      <Receipt className="h-4 w-4" />
      {riepilogo && (
        <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gray-700 px-1 text-[10px] leading-4 text-white">
          {riepilogo.n}
        </span>
      )}
    </Button>
  )
}
