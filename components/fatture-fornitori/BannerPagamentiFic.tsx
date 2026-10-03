'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { riprovaTuttiFic } from '@/actions/fic-pagamenti'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import type { ProblemiFic } from '@/types/fatture-fornitori'

export default function BannerPagamentiFic({ problemi, puoRiprovare }: { problemi: ProblemiFic; puoRiprovare: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (problemi.elenco.length === 0) return null

  function riprova() {
    startTransition(async () => {
      try {
        const r = await riprovaTuttiFic()
        if (!r.ok) toast.error(r.errore)
        else mostraEsitoFic(r.esito)
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm dark:bg-rose-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <strong>{problemi.elenco.length} pagamenti non allineati su FiC</strong>
        {puoRiprovare && problemi.daAllineare > 0 && (
          <Button size="sm" variant="outline" onClick={riprova} disabled={pending}>
            {pending ? 'Riprovo…' : 'Riprova tutti'}
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {problemi.elenco.map((p, i) => (
          <li key={`${p.scadenza_id}-${i}`}>
            <Link href={`/commesse/${p.gruppo_id}`} className="underline">{p.fornitore || 'Scadenza'}</Link>
            {' — '}{p.stato_fic === 'da_verificare' ? 'da verificare: ' : 'da allineare: '}{p.messaggio_fic ?? ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
