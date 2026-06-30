'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Loader2, Search, FileSignature } from 'lucide-react'
import { getPreventiviPerCopia, copiaArticoloInPreventivo } from '@/actions/preventivi'
import { formatEuro } from '@/lib/pricing'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClienteSnapshot } from '@/types/preventivo'

type PreventivoLite = {
  id: string
  numero: string | null
  cliente_snapshot: ClienteSnapshot
  totale_finale: number
  created_at: string
  stato: string
  firma_stato: 'in_attesa' | 'firmato' | 'rifiutato' | 'scaduto' | null
}

function nomeCliente(s: ClienteSnapshot): string {
  if (s.tipo === 'azienda') return s.ragione_sociale || '—'
  return [s.nome, s.cognome].filter(Boolean).join(' ') || '—'
}

interface Props {
  open: boolean
  onClose: () => void
  articoloId: string | null
  articoloNome: string
  currentPreventivoId: string
}

export default function DialogCopiaArticolo({ open, onClose, articoloId, articoloNome, currentPreventivoId }: Props) {
  const router = useRouter()
  const [preventivi, setPreventivi] = useState<PreventivoLite[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getPreventiviPerCopia()
      .then((data) => { if (!cancelled) setPreventivi(data as PreventivoLite[]) })
      .catch(() => { if (!cancelled) toast.error('Errore nel caricamento dei preventivi') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  const filtrati = useMemo(() => {
    const q = query.trim().toLowerCase()
    return preventivi
      .filter((p) => p.id !== currentPreventivoId)
      .filter((p) => {
        if (!q) return true
        return (
          (p.numero ?? '').toLowerCase().includes(q) ||
          nomeCliente(p.cliente_snapshot).toLowerCase().includes(q)
        )
      })
  }, [preventivi, query, currentPreventivoId])

  function handleCopia(p: PreventivoLite) {
    if (!articoloId) return
    setTargetId(p.id)
    startTransition(async () => {
      try {
        await copiaArticoloInPreventivo(articoloId, p.id)
        toast.success(`Voce copiata nel preventivo ${p.numero ?? ''}`.trim())
        router.refresh()
        onClose()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore durante la copia')
        setTargetId(null)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            Copia voce in un altro preventivo
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 truncate">
          Voce: <span className="font-medium text-gray-700">{articoloNome}</span>
        </p>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            autoFocus
            placeholder="Cerca per numero o cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Caricamento...
          </div>
        ) : filtrati.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            {query ? 'Nessun preventivo trovato.' : 'Nessun altro preventivo disponibile.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1 max-h-80 overflow-y-auto py-1">
            {filtrati.map((p) => {
              const bloccato = p.firma_stato === 'in_attesa' || p.firma_stato === 'firmato'
              const inCorso = isPending && targetId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={bloccato || isPending}
                  onClick={() => handleCopia(p)}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                    bloccato
                      ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{p.numero ?? 'Senza numero'}</span>
                      {bloccato && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 border border-amber-300 rounded px-1 leading-none py-0.5">
                          <FileSignature className="h-2.5 w-2.5" /> firmato
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {nomeCliente(p.cliente_snapshot)} · {new Date(p.created_at).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-gray-600 whitespace-nowrap">€ {formatEuro(p.totale_finale)}</span>
                    {inCorso && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
