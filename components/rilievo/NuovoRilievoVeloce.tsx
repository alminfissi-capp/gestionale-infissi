'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import StepCliente from '@/components/preventivi/StepCliente'
import DialogVoceVeloce from '@/components/rilievo/DialogVoceVeloce'
import { createRilievoVeloce } from '@/actions/rilievo-veloce'
import { toast } from 'sonner'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshot } from '@/types/preventivo'
import type { VoceInput, OpzioniRilievo } from '@/types/rilievo-veloce'

interface Props {
  clienti: Cliente[]
  opzioni: OpzioniRilievo
}

const SNAPSHOT_VUOTO: ClienteSnapshot = {
  tipo: 'privato',
  ragione_sociale: null,
  nome: null,
  cognome: null,
  telefono: null,
  email: null,
  indirizzo: null,
  via: null,
  civico: null,
  cap: null,
  citta: null,
  provincia: null,
  nazione: null,
  codice_sdi: null,
  cantiere: null,
  cf_piva: null,
}

export default function NuovoRilievoVeloce({ clienti, opzioni }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [clienteId, setClienteId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ClienteSnapshot>(SNAPSHOT_VUOTO)
  const [note, setNote] = useState('')

  const [voci, setVoci] = useState<VoceInput[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const clienteValido =
    snapshot.tipo === 'azienda'
      ? !!snapshot.ragione_sociale?.trim()
      : !!(snapshot.nome?.trim() || snapshot.cognome?.trim())

  const openAdd = () => {
    setEditingIndex(null)
    setDialogOpen(true)
  }

  const openEdit = (idx: number) => {
    setEditingIndex(idx)
    setDialogOpen(true)
  }

  const handleSaveVoce = (voce: VoceInput) => {
    if (editingIndex !== null) {
      setVoci((prev) => prev.map((v, i) => (i === editingIndex ? { ...voce, ordine: i } : v)))
    } else {
      setVoci((prev) => [...prev, { ...voce, ordine: prev.length }])
    }
    setDialogOpen(false)
  }

  const handleDeleteVoce = (idx: number) => {
    setVoci((prev) => prev.filter((_, i) => i !== idx).map((v, i) => ({ ...v, ordine: i })))
  }

  const handleSave = () => {
    if (!clienteValido) return
    startTransition(async () => {
      try {
        const clienteSnapshot = {
          tipo: snapshot.tipo ?? 'privato',
          ragione_sociale: snapshot.ragione_sociale ?? null,
          nome: snapshot.nome ?? null,
          cognome: snapshot.cognome ?? null,
          telefono: snapshot.telefono ?? null,
          email: snapshot.email ?? null,
          indirizzo: snapshot.indirizzo ?? null,
          cantiere: snapshot.cantiere ?? null,
        }
        const { id } = await createRilievoVeloce({
          clienteSnapshot,
          note,
          voci,
        })
        toast.success('Rilievo salvato')
        router.push(`/rilievo/veloce/${id}`)
      } catch {
        toast.error('Errore salvataggio rilievo')
      }
    })
  }

  const labelVoce = (v: VoceInput) => {
    const parti: string[] = []
    if (v.voce) parti.push(v.voce)
    if (v.tipologia) parti.push(v.tipologia)
    if (v.larghezza_mm && v.altezza_mm) parti.push(`${v.larghezza_mm}×${v.altezza_mm} mm`)
    return parti.join(' — ') || 'Serramento'
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/rilievo/veloce">
            <ChevronLeft className="h-4 w-4" />
            Rilievo veloce
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Nuovo rilievo veloce</h1>
        <p className="text-sm text-gray-500 mt-0.5">Inserisci i dati del cliente e i serramenti rilevati</p>
      </div>

      {/* Dati cliente */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Dati cliente / cantiere</h2>
        <StepCliente
          clienti={clienti}
          clienteId={clienteId}
          clienteSnapshot={snapshot}
          numero=""
          onClienteIdChange={setClienteId}
          onSnapshotChange={setSnapshot}
          onNumeroChange={() => {}}
          showNumero={false}
        />
      </div>

      {/* Note rilievo */}
      <div className="bg-white rounded-xl border p-5 space-y-1.5">
        <Label>Note rilievo</Label>
        <textarea
          className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Note generali sul rilievo…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Voci serramenti */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Serramenti rilevati</h2>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi
          </Button>
        </div>

        {voci.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            Nessun serramento aggiunto. Clicca <strong>Aggiungi</strong> per iniziare.
          </div>
        ) : (
          <div className="space-y-2">
            {voci.map((v, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-gray-50">
                <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{labelVoce(v)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Qt. {v.quantita}
                    {v.colore_interno ? ` · ${v.colore_interno}` : ''}
                    {v.tipologia_vetro ? ` · ${v.tipologia_vetro}` : ''}
                    {v.accessori.length > 0 ? ` · ${v.accessori.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(idx)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                    title="Modifica"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteVoce(idx)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Elimina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" asChild>
          <Link href="/rilievo/veloce">Annulla</Link>
        </Button>
        <Button onClick={handleSave} disabled={!clienteValido || isPending}>
          {isPending ? 'Salvataggio…' : 'Salva rilievo'}
        </Button>
      </div>

      <DialogVoceVeloce
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveVoce}
        opzioni={opzioni}
        initialValues={editingIndex !== null ? voci[editingIndex] : undefined}
        isEditing={editingIndex !== null}
      />
    </div>
  )
}
