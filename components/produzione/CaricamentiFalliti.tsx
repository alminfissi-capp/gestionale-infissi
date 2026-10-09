'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { segnaCaricamentiRisolti } from '@/actions/conferme-ordine'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { formattaDataOra } from '@/lib/produzione-tracking'
import type { CaricamentoFallito } from '@/types/produzione'

/**
 * Fornitori che hanno provato a caricare un file dal link dell'ordine senza
 * riuscirci. Spariscono da soli quando il fornitore ce la fa, oppure con
 * "Risolto" (file arrivato per email, fornitore richiamato).
 */
export default function CaricamentiFalliti({ elenco }: { elenco: CaricamentoFallito[] }) {
  const router = useRouter()
  const [inCorso, setInCorso] = useState<string | null>(null)
  if (elenco.length === 0) return null

  const risolvi = async (c: CaricamentoFallito) => {
    const chiave = `${c.ordine_id}:${c.tipo}`
    setInCorso(chiave)
    const esito = await segnaCaricamentiRisolti(c.ordine_id, c.tipo)
    setInCorso(null)
    if (esito.error) toast.error(esito.error)
    else router.refresh()
  }

  return (
    <section
      aria-label="Caricamenti non riusciti"
      className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40"
    >
      <div className="flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-red-600 dark:text-red-400" />
        <h2 className="text-base font-semibold text-red-700 dark:text-red-300">Caricamenti non riusciti</h2>
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">{elenco.length}</span>
      </div>
      <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
        Il fornitore ha provato a caricare un file dal link dell&apos;ordine senza riuscirci: contattatelo.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {elenco.map((c) => {
          const chiave = `${c.ordine_id}:${c.tipo}`
          return (
            <div
              key={chiave}
              className="flex flex-col gap-2 rounded-md border border-red-200 bg-white p-3 dark:border-red-900 dark:bg-gray-950"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {formattaNumeroOrdine(c.numero_ordine)} · {c.fornitore_nome ?? 'fornitore n.d.'}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {c.numero_commessa ? `${c.numero_commessa} · ${c.cliente_nome ?? ''}` : 'Magazzino'}
                </p>
                <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                  {c.tipo === 'conferma' ? "Conferma d'ordine" : 'Documento'}: <span className="break-all">{c.ultimo_nome_file}</span>
                </p>
                <p className="text-xs text-red-700 dark:text-red-300">{c.ultimo_errore}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {c.tentativi === 1 ? '1 tentativo' : `${c.tentativi} tentativi`} · ultimo il {formattaDataOra(c.ultimo_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="h-8 flex-1">
                  <Link href={c.commessa_id ? `/produzione/${c.commessa_id}` : '/magazzino/ordini'}>Apri ordine</Link>
                </Button>
                <Button
                  size="sm"
                  className="h-8 flex-1 bg-red-600 hover:bg-red-700"
                  disabled={inCorso === chiave}
                  onClick={() => void risolvi(c)}
                >
                  {inCorso === chiave ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                  Risolto
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
