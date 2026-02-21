'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshot } from '@/types/preventivo'

interface Props {
  clienti: Cliente[]
  clienteId: string | null
  clienteSnapshot: ClienteSnapshot
  numero: string
  onClienteIdChange: (id: string | null) => void
  onSnapshotChange: (snapshot: ClienteSnapshot) => void
  onNumeroChange: (numero: string) => void
}

export default function StepCliente({
  clienti,
  clienteId,
  clienteSnapshot,
  numero,
  onClienteIdChange,
  onSnapshotChange,
  onNumeroChange,
}: Props) {
  const handleClienteSelect = (id: string) => {
    if (id === '__manual__') {
      onClienteIdChange(null)
      return
    }
    const cliente = clienti.find((c) => c.id === id)
    if (!cliente) return
    onClienteIdChange(id)
    onSnapshotChange({
      nome: cliente.nome,
      cognome: cliente.cognome,
      telefono: cliente.telefono,
      email: cliente.email,
      indirizzo: cliente.indirizzo,
      cantiere: cliente.cantiere,
      cf_piva: cliente.cf_piva,
    })
  }

  const setField = (field: keyof ClienteSnapshot, value: string) => {
    onSnapshotChange({ ...clienteSnapshot, [field]: value || null })
  }

  const nomeCompleto = (c: Cliente) =>
    [c.cognome, c.nome].filter(Boolean).join(' ') || c.telefono || c.email || '—'

  return (
    <div className="space-y-5">
      {/* Selezione cliente esistente */}
      <div className="space-y-1.5">
        <Label>Seleziona cliente esistente (opzionale)</Label>
        <Select
          value={clienteId ?? '__manual__'}
          onValueChange={handleClienteSelect}
        >
          <SelectTrigger>
            <SelectValue placeholder="— Inserisci manualmente —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__manual__">— Inserisci manualmente —</SelectItem>
            {clienti.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {nomeCompleto(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clienteId && (
          <p className="text-xs text-blue-600">
            Cliente selezionato — puoi modificare i campi sotto se necessario.
          </p>
        )}
      </div>

      {/* Dati cliente */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input
            value={clienteSnapshot.nome ?? ''}
            onChange={(e) => setField('nome', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cognome</Label>
          <Input
            value={clienteSnapshot.cognome ?? ''}
            onChange={(e) => setField('cognome', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telefono</Label>
          <Input
            value={clienteSnapshot.telefono ?? ''}
            onChange={(e) => setField('telefono', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            value={clienteSnapshot.email ?? ''}
            onChange={(e) => setField('email', e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Indirizzo</Label>
          <Input
            value={clienteSnapshot.indirizzo ?? ''}
            onChange={(e) => setField('indirizzo', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cantiere / Località</Label>
          <Input
            value={clienteSnapshot.cantiere ?? ''}
            onChange={(e) => setField('cantiere', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>CF / Partita IVA</Label>
          <Input
            value={clienteSnapshot.cf_piva ?? ''}
            onChange={(e) => setField('cf_piva', e.target.value)}
          />
        </div>
      </div>

      {/* Numero preventivo */}
      <div className="space-y-1.5 pt-2 border-t">
        <Label>Numero preventivo</Label>
        <Input
          value={numero}
          onChange={(e) => onNumeroChange(e.target.value)}
          placeholder="es. 2026/001"
          className="max-w-xs"
        />
        <p className="text-xs text-gray-400">Campo opzionale — libero, non viene verificata l&apos;unicità.</p>
      </div>
    </div>
  )
}
