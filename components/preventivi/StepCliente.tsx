'use client'

import { Building2, User } from 'lucide-react'
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
      tipo: cliente.tipo,
      ragione_sociale: cliente.ragione_sociale,
      nome: cliente.nome,
      cognome: cliente.cognome,
      telefono: cliente.telefono,
      email: cliente.email,
      indirizzo: cliente.indirizzo,
      via: cliente.via,
      civico: cliente.civico,
      cap: cliente.cap,
      citta: cliente.citta,
      provincia: cliente.provincia,
      nazione: cliente.nazione,
      codice_sdi: cliente.codice_sdi,
      cantiere: cliente.cantiere,
      cf_piva: cliente.cf_piva,
    })
  }

  const setField = (field: keyof ClienteSnapshot, value: string) => {
    onSnapshotChange({ ...clienteSnapshot, [field]: value || null })
  }

  // Quando si cambia tipo, azzera i campi specifici dell'altro tipo
  const setTipo = (t: 'privato' | 'azienda') => {
    if (t === clienteSnapshot.tipo) return
    if (t === 'privato') {
      onSnapshotChange({ ...clienteSnapshot, tipo: t, ragione_sociale: null, codice_sdi: null })
    } else {
      onSnapshotChange({ ...clienteSnapshot, tipo: t, nome: null, cognome: null })
    }
  }

  const nomeCompleto = (c: Cliente) => {
    if (c.tipo === 'azienda') return c.ragione_sociale || c.email || c.telefono || '—'
    return [c.nome, c.cognome].filter(Boolean).join(' ') || c.telefono || c.email || '—'
  }

  const tipo = clienteSnapshot.tipo ?? 'privato'

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

      {/* ── Scelta tipo ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Tipo cliente
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTipo('privato')}
            className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 transition-colors ${tipo === 'privato' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            <User className="h-5 w-5" />
            <span className="text-sm font-semibold">Privato</span>
          </button>
          <button
            type="button"
            onClick={() => setTipo('azienda')}
            className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 transition-colors ${tipo === 'azienda' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Azienda</span>
          </button>
        </div>
      </div>

      {/* ── Dati anagrafici (specifici per tipo) ── */}
      <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {tipo === 'azienda' ? 'Dati azienda' : 'Dati persona'}
        </p>

        {tipo === 'azienda' ? (
          <>
            <div className="space-y-1.5">
              <Label>Ragione sociale *</Label>
              <Input
                value={clienteSnapshot.ragione_sociale ?? ''}
                onChange={(e) => setField('ragione_sociale', e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Partita IVA</Label>
                <Input
                  value={clienteSnapshot.cf_piva ?? ''}
                  onChange={(e) => setField('cf_piva', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Codice SDI / PEC</Label>
                <Input
                  value={clienteSnapshot.codice_sdi ?? ''}
                  onChange={(e) => setField('codice_sdi', e.target.value)}
                  placeholder="es. XXXXXXX"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  value={clienteSnapshot.nome ?? ''}
                  onChange={(e) => setField('nome', e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cognome *</Label>
                <Input
                  value={clienteSnapshot.cognome ?? ''}
                  onChange={(e) => setField('cognome', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Codice Fiscale</Label>
                <Input
                  value={clienteSnapshot.cf_piva ?? ''}
                  onChange={(e) => setField('cf_piva', e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Contatti ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contatti</p>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
      </div>

      {/* ── Indirizzo ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Indirizzo</p>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Via / Piazza</Label>
            <Input
              value={clienteSnapshot.via ?? ''}
              onChange={(e) => setField('via', e.target.value)}
              placeholder="Via Roma"
            />
          </div>
          <div className="w-24 space-y-1.5">
            <Label>N. civico</Label>
            <Input
              value={clienteSnapshot.civico ?? ''}
              onChange={(e) => setField('civico', e.target.value)}
              placeholder="10"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-28 space-y-1.5">
            <Label>CAP</Label>
            <Input
              value={clienteSnapshot.cap ?? ''}
              onChange={(e) => setField('cap', e.target.value)}
              placeholder="00100"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>Città</Label>
            <Input
              value={clienteSnapshot.citta ?? ''}
              onChange={(e) => setField('citta', e.target.value)}
              placeholder="Milano"
            />
          </div>
          <div className="w-20 space-y-1.5">
            <Label>Prov.</Label>
            <Input
              value={clienteSnapshot.provincia ?? ''}
              onChange={(e) => setField('provincia', e.target.value)}
              placeholder="MI"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nazione</Label>
          <Input
            value={clienteSnapshot.nazione ?? ''}
            onChange={(e) => setField('nazione', e.target.value)}
            placeholder="Italia"
          />
        </div>
      </div>

      {/* ── Altro ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Altro</p>
        <div className="space-y-1.5">
          <Label>Cantiere / Località</Label>
          <Input
            value={clienteSnapshot.cantiere ?? ''}
            onChange={(e) => setField('cantiere', e.target.value)}
          />
        </div>
      </div>

      {/* ── Numero preventivo ── */}
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
