'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { getScraperPreventivo } from '@/actions/magazzino'

export default function PreventivoScraperBadge({ iniziale }: { iniziale: string | null }) {
  const [nOrdine, setNOrdine] = useState<string | null>(iniziale)

  useEffect(() => {
    let mounted = true
    const tick = async () => {
      const v = await getScraperPreventivo()
      if (mounted && v) setNOrdine(v)
    }
    // aggiorna ogni 60s — riflette il cambio preventivo lato scraper
    const id = setInterval(tick, 60_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  if (!nOrdine) return null

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600"
      title="Preventivo CRM Edilsider usato dallo scraper per leggere prezzi e disponibilità"
    >
      <FileText className="h-3.5 w-3.5 text-gray-400" />
      Preventivo scraper: <strong className="font-semibold text-gray-800">#{nOrdine}</strong>
    </span>
  )
}
