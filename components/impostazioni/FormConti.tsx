'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Check } from 'lucide-react'
import { createConto, updateConto, deleteConto } from '@/actions/conti'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ContoCorrente } from '@/types/commessa'

interface Props {
  initialConti: ContoCorrente[]
}

// Riga con snapshot dei valori salvati (per salvare solo se cambiato al blur)
type ContoRow = ContoCorrente & { nomeSalvato: string; saldoSalvato: number }
const toRow = (c: ContoCorrente): ContoRow => ({ ...c, nomeSalvato: c.nome, saldoSalvato: c.saldo_attuale })

const parseSaldo = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

export default function FormConti({ initialConti }: Props) {
  const [conti, setConti] = useState<ContoRow[]>(() => initialConti.map(toRow))
  const [saldiStr, setSaldiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConti.map((c) => [c.id, String(c.saldo_attuale)]))
  )
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoSaldo, setNuovoSaldo] = useState('')
  const [adding, setAdding] = useState(false)

  const handleNomeChange = (id: string, nome: string) =>
    setConti((cur) => cur.map((c) => (c.id === id ? { ...c, nome } : c)))

  const handleSalva = async (id: string) => {
    const conto = conti.find((c) => c.id === id)
    if (!conto) return
    const saldo = parseSaldo(saldiStr[id] ?? '')
    if (conto.nome.trim() === conto.nomeSalvato && saldo === conto.saldoSalvato) return
    if (!conto.nome.trim()) { toast.error('Il nome del conto è obbligatorio'); return }
    try {
      await updateConto(id, { nome: conto.nome, saldo_attuale: saldo })
      setConti((cur) =>
        cur.map((c) => (c.id === id ? { ...c, saldo_attuale: saldo, nomeSalvato: c.nome.trim(), saldoSalvato: saldo } : c))
      )
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo conto? Le scadenze collegate resteranno senza conto.')) return
    const prev = conti
    setConti((cur) => cur.filter((c) => c.id !== id))
    try {
      await deleteConto(id)
    } catch {
      setConti(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleAdd = async () => {
    if (!nuovoNome.trim()) { toast.error('Inserisci il nome del conto'); return }
    setAdding(true)
    try {
      const saldo = parseSaldo(nuovoSaldo)
      const { id } = await createConto({ nome: nuovoNome, saldo_attuale: saldo })
      const nuovo: ContoCorrente = {
        id, organization_id: '', nome: nuovoNome.trim(), saldo_attuale: saldo,
        ordine: 0, created_at: '', updated_at: '',
      }
      setConti((cur) => [...cur, toRow(nuovo)])
      setSaldiStr((cur) => ({ ...cur, [id]: String(saldo) }))
      setNuovoNome('')
      setNuovoSaldo('')
      toast.success('Conto aggiunto')
    } catch {
      toast.error("Errore nell'aggiunta del conto")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      {conti.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessun conto configurato. Aggiungine uno per poterlo scegliere sulle scadenze.
        </p>
      )}

      {conti.map((c) => {
        const dirty = c.nome.trim() !== c.nomeSalvato || parseSaldo(saldiStr[c.id] ?? '') !== c.saldoSalvato
        return (
          <div key={c.id} className="flex items-center gap-2">
            <Input
              value={c.nome}
              placeholder="Nome banca / conto"
              onChange={(e) => handleNomeChange(c.id, e.target.value)}
              onBlur={() => handleSalva(c.id)}
              className="flex-1"
            />
            <div className="relative w-36 shrink-0">
              <Input
                type="number"
                step={0.01}
                value={saldiStr[c.id] ?? ''}
                placeholder="0,00"
                onChange={(e) => setSaldiStr((cur) => ({ ...cur, [c.id]: e.target.value }))}
                onBlur={() => handleSalva(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="text-right pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
            </div>
            {dirty && (
              <Button
                variant="ghost"
                size="icon"
                className="text-emerald-600 hover:text-emerald-700 shrink-0"
                title="Salva"
                onClick={() => handleSalva(c.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-red-600 shrink-0"
              title="Elimina"
              onClick={() => handleDelete(c.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      {/* Aggiungi conto */}
      <div className="flex items-center gap-2 border-t pt-3">
        <Input
          value={nuovoNome}
          placeholder="Nuovo conto (es. Intesa c/c)"
          onChange={(e) => setNuovoNome(e.target.value)}
          className="flex-1"
        />
        <div className="relative w-36 shrink-0">
          <Input
            type="number"
            step={0.01}
            value={nuovoSaldo}
            placeholder="Saldo 0,00"
            onChange={(e) => setNuovoSaldo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            className="text-right pr-7"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          {adding ? '...' : 'Aggiungi'}
        </Button>
      </div>
    </div>
  )
}
