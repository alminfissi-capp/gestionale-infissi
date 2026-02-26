'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react'
import { createPreventivo, updatePreventivo } from '@/actions/preventivi'
import {
  calcolaSubtotale,
  calcolaSpeseTrasportoPezzi,
  calcolaTotalePreventivo,
  formatEuro,
} from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import StepCliente from './StepCliente'
import FormArticolo from './FormArticolo'
import TabellaArticoli from './TabellaArticoli'
import ScontoSelect from './ScontoSelect'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type {
  ArticoloWizard,
  ClienteSnapshot,
  PreventivoCompleto,
} from '@/types/preventivo'

const STEPS = ['Cliente', 'Articoli', 'Riepilogo']

const SNAPSHOT_VUOTO: ClienteSnapshot = {
  nome: null,
  cognome: null,
  telefono: null,
  email: null,
  indirizzo: null,
  cantiere: null,
  cf_piva: null,
}

interface Props {
  clienti: Cliente[]
  listini: CategoriaConListini[]
  /** Se valorizzato: modalità modifica */
  preventivo?: PreventivoCompleto
}

/** Calcola spese trasporto raggruppando gli articoli per categoria */
function calcolaTrasportoPerCategoria(
  articoli: ArticoloWizard[],
  listini: CategoriaConListini[]
): { totale: number; dettaglio: { nome: string; pezzi: number; costo: number }[] } {
  const pezziPerCat = new Map<
    string,
    { nome: string; pezzi: number; unitario: number; minimo: number; minPezzi: number }
  >()

  for (const articolo of articoli) {
    if (!articolo.listino_id) continue
    const cat = listini.find((c) => c.listini.some((l) => l.id === articolo.listino_id))
    if (!cat) continue
    const existing = pezziPerCat.get(cat.id)
    if (existing) {
      existing.pezzi += articolo.quantita
    } else {
      pezziPerCat.set(cat.id, {
        nome: cat.nome,
        pezzi: articolo.quantita,
        unitario: cat.trasporto_costo_unitario,
        minimo: cat.trasporto_costo_minimo,
        minPezzi: cat.trasporto_minimo_pezzi,
      })
    }
  }

  const dettaglio: { nome: string; pezzi: number; costo: number }[] = []
  let totale = 0

  for (const { nome, pezzi, unitario, minimo, minPezzi } of pezziPerCat.values()) {
    const costo = calcolaSpeseTrasportoPezzi(pezzi, unitario, minimo, minPezzi)
    dettaglio.push({ nome, pezzi, costo })
    totale += costo
  }

  return { totale, dettaglio }
}

export default function WizardPreventivo({ clienti, listini, preventivo }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)

  // Step 1 — cliente
  const [clienteId, setClienteId] = useState<string | null>(preventivo?.cliente_id ?? null)
  const [snapshot, setSnapshot] = useState<ClienteSnapshot>(
    preventivo?.cliente_snapshot ?? SNAPSHOT_VUOTO
  )
  const [numero, setNumero] = useState(preventivo?.numero ?? '')

  // Step 2 — articoli
  const [articoli, setArticoli] = useState<ArticoloWizard[]>(
    preventivo?.articoli.map((a) => ({ ...a, tempId: a.id })) ?? []
  )

  // Step 3 — note/sconto globale
  const [scontoGlobale, setScontoGlobale] = useState(preventivo?.sconto_globale ?? 0)
  const [note, setNote] = useState(preventivo?.note ?? '')

  // Calcoli riepilogo
  const totali = useMemo(() => {
    const subtotale = calcolaSubtotale(articoli)
    const { totale: speseTrasporto, dettaglio: dettaglioTrasporto } =
      calcolaTrasportoPerCategoria(articoli, listini)
    const { importoSconto, totaleArticoli, totaleFinale } = calcolaTotalePreventivo(
      subtotale,
      scontoGlobale,
      speseTrasporto
    )
    const totalePezzi = articoli.reduce((s, a) => s + a.quantita, 0)
    return { totalePezzi, subtotale, speseTrasporto, dettaglioTrasporto, importoSconto, totaleArticoli, totaleFinale }
  }, [articoli, scontoGlobale, listini])

  const canGoNext = () => {
    if (step === 0) return true
    if (step === 1) return articoli.length > 0
    return true
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        const input = {
          clienteId,
          clienteSnapshot: snapshot,
          numero,
          articoli: articoli.map(({ tempId: _t, ...rest }) => rest),
          scontoGlobale,
          note,
        }

        if (preventivo) {
          await updatePreventivo(preventivo.id, input)
          toast.success('Preventivo aggiornato')
          router.push(`/preventivi/${preventivo.id}`)
        } else {
          const { id } = await createPreventivo(input)
          toast.success('Preventivo creato')
          router.push(`/preventivi/${id}`)
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Errore durante il salvataggio')
      }
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full transition-colors ${
                i === step
                  ? 'bg-blue-600 text-white'
                  : i < step
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-400 cursor-default'
              }`}
            >
              <span className="text-xs font-bold">{i + 1}</span>
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <span className="text-gray-300 text-sm">›</span>
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-lg border p-6">
        {step === 0 && (
          <StepCliente
            clienti={clienti}
            clienteId={clienteId}
            clienteSnapshot={snapshot}
            numero={numero}
            onClienteIdChange={setClienteId}
            onSnapshotChange={setSnapshot}
            onNumeroChange={setNumero}
          />
        )}

        {step === 1 && (
          <div className="space-y-4">
            <FormArticolo listini={listini} onAdd={(a) => setArticoli((prev) => [...prev, a])} />
            <TabellaArticoli articoli={articoli} onChange={setArticoli} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Riepilogo articoli */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Articoli ({articoli.length})
              </p>
              <TabellaArticoli articoli={articoli} onChange={setArticoli} />
            </div>

            {/* Sconto globale e note */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Sconto globale sul totale</Label>
                <ScontoSelect value={scontoGlobale} onChange={setScontoGlobale} max={50} />
              </div>
              <div className="space-y-1.5">
                <Label>Numero preventivo</Label>
                <Input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="es. 2026/001"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Note</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Condizioni di pagamento, tempi di consegna, ecc."
                  rows={3}
                />
              </div>
            </div>

            {/* Totali */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotale ({totali.totalePezzi} pz)</span>
                <span>€ {formatEuro(totali.subtotale)}</span>
              </div>
              {scontoGlobale > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Sconto globale {scontoGlobale}%</span>
                  <span>− € {formatEuro(totali.importoSconto)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Totale articoli</span>
                <span>€ {formatEuro(totali.totaleArticoli)}</span>
              </div>

              {/* Trasporto per categoria */}
              {totali.dettaglioTrasporto.length === 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Spese trasporto</span>
                  <span>€ {formatEuro(0)}</span>
                </div>
              )}
              {totali.dettaglioTrasporto.length === 1 && (
                <div className="flex justify-between text-gray-600">
                  <span>
                    Spese trasporto ({totali.dettaglioTrasporto[0].pezzi} pz)
                  </span>
                  <span>€ {formatEuro(totali.dettaglioTrasporto[0].costo)}</span>
                </div>
              )}
              {totali.dettaglioTrasporto.length > 1 && (
                <>
                  {totali.dettaglioTrasporto.map((d, i) => (
                    <div key={i} className="flex justify-between text-gray-500 text-xs pl-2">
                      <span>Trasporto {d.nome} ({d.pezzi} pz)</span>
                      <span>€ {formatEuro(d.costo)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-gray-600">
                    <span>Spese trasporto totale</span>
                    <span>€ {formatEuro(totali.speseTrasporto)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                <span>Totale finale</span>
                <span>€ {formatEuro(totali.totaleFinale)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          disabled={isPending}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {step === 0 ? 'Annulla' : 'Indietro'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()}>
            Avanti
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={isPending || articoli.length === 0}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {preventivo ? 'Aggiorna preventivo' : 'Crea preventivo'}
          </Button>
        )}
      </div>
    </div>
  )
}
