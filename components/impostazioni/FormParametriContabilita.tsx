'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { salvaParametriContabilita } from '@/actions/contabilita-commessa'
import { parseImporto } from '@/lib/fic/pagamenti'

/** Valori di partenza della pagina contabile: ogni commessa li puo' cambiare per se'. */
export default function FormParametriContabilita({ tariffa, percFissi }: { tariffa: number; percFissi: number }) {
  const [t, setT] = useState(String(tariffa).replace('.', ','))
  const [p, setP] = useState(String(percFissi).replace('.', ','))
  const [pending, startTransition] = useTransition()

  function salva() {
    const nt = parseImporto(t)
    const np = parseImporto(p)
    if (nt === null || np === null) { toast.error('Valori non validi'); return }
    startTransition(async () => {
      try {
        const r = await salvaParametriContabilita({ tariffa: nt, percFissi: np })
        if (!r.ok) toast.error(r.errore)
        else toast.success('Salvato')
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <Label htmlFor="pc-tariffa">Manodopera: € al giorno per persona</Label>
        <Input id="pc-tariffa" className="w-32 text-right" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pc-perc">Costi fissi di commessa %</Label>
        <Input id="pc-perc" className="w-24 text-right" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
      </div>
      <Button onClick={salva} disabled={pending}>{pending ? 'Salvataggio…' : 'Salva'}</Button>
    </div>
  )
}
