'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCommessePerCondivisione } from '@/actions/commesse'
import { caricaDocumentoCommessa } from '@/lib/upload-documento'
import { filtraCommesse } from '@/lib/ricerca-commesse'
import { TIPI_DOCUMENTO_COMMESSA } from '@/types/commessa'
import type { CommessaCondivisione } from '@/types/commessa'
import type { PassiProps } from '@/types/condivisione'

export default function AreaCommesse({ file, onFatto, onIndietro }: PassiProps) {
  const [commesse, setCommesse] = useState<CommessaCondivisione[] | null>(null)
  const [cerca, setCerca] = useState('')
  const [scelta, setScelta] = useState<CommessaCondivisione | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  // Caricamento dell'elenco: unica cosa che serve dal server prima di scegliere.
  useEffect(() => {
    let vivo = true
    getCommessePerCondivisione()
      .then((c) => { if (vivo) setCommesse(c) })
      .catch(() => { if (vivo) setCommesse([]) })
    return () => { vivo = false }
  }, [])

  const filtrate = filtraCommesse(commesse ?? [], cerca)

  const salva = async (tipo: string) => {
    if (!scelta) return
    setSalvando(tipo)
    const errore = await caricaDocumentoCommessa(file.blob, file.nome, scelta.id, tipo)
    setSalvando(null)
    if (errore) {
      toast.error(errore)
      return
    }
    toast.success(`Salvato su ${scelta.numero_commessa ?? scelta.cliente_nome}`)
    onFatto()
  }

  // ── Secondo passo: il tipo di documento ────────────────────────────────────
  if (scelta) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => setScelta(null)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {scelta.numero_commessa ?? 'Senza numero'} — {scelta.cliente_nome}
        </Button>
        <p className="text-sm font-medium text-gray-700">Che tipo di documento è?</p>
        <div className="grid grid-cols-2 gap-2">
          {TIPI_DOCUMENTO_COMMESSA.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              className="h-12 justify-start"
              disabled={salvando !== null}
              onClick={() => salva(t.value)}
            >
              {salvando === t.value
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Upload className="h-4 w-4 mr-2 text-teal-600" />}
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  // ── Primo passo: la commessa ───────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={onIndietro}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Cambia area
      </Button>
      <p className="text-sm font-medium text-gray-700">Su quale commessa?</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-8"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cliente, numero commessa o preventivo..."
          autoFocus
        />
      </div>

      {commesse === null ? (
        <p className="text-sm text-gray-400 text-center py-6">Caricamento commesse...</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nessuna commessa trovata.</p>
      ) : (
        <div className="divide-y rounded-md border bg-white max-h-[50vh] overflow-y-auto">
          {filtrate.slice(0, 50).map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
              onClick={() => setScelta(c)}
            >
              <p className="text-sm font-medium text-gray-900">
                {c.numero_commessa ?? 'Senza numero'} — {c.cliente_nome}
              </p>
              {c.numero_preventivo && (
                <p className="text-xs text-gray-500 font-mono">{c.numero_preventivo}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
