'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function CercaCatalogoESP() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valore = e.target.value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (valore.trim()) p.set('cerca', valore.trim())
      else p.delete('cerca')
      p.delete('pagina')
      router.push(`${pathname}?${p.toString()}`)
    }, 350)
  }

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        placeholder="Cerca per descrizione…"
        defaultValue={params.get('cerca') ?? ''}
        onChange={handleChange}
        className="pl-9"
      />
    </div>
  )
}
