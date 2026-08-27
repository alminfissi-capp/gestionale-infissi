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
type ContoRow = ContoCorrente & { nomeSalvato: string; saldoSalvato: number; fidoSalvato: number }
const toRow = (c: ContoCorrente): ContoRow => ({
  ...c,
  nomeSalvato: c.nome,
  saldoSalvato: c.saldo_attuale,
  fidoSalvato: c.fido_accordato,
})

const parseSaldo = (s: string) => {
  const v = parseFloat((s ?? '').replace(',', '.'))
  return isNaN(v) ? 0 : v
}

// Un fido negativo non significa niente e falserebbe il calcolo dell'utilizzato.
const parseFido = (s: string) => Math.max(0, parseSaldo(s))

export default function FormConti({ initialConti }: Props) {
  const [conti, setConti] = useState<ContoRow[]>(() => initialConti.map(toRow))
  const [saldiStr, setSaldiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConti.map((c) => [c.id, String(c.saldo_attuale)]))
  )
  const [fidiStr, setFidiStr] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialConti.map((c) => [c.id, String(c.fido_accordato)]))
  )
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoSaldo, setNuovoSaldo] = useState('')
  const [nuovoFido, setNuovoFido] = useState('')
  const [adding, setAdding] = useState(false)

  const handleNomeChange = (id: string, nome: string) =>
    setConti((cur) => cur.map((c) => (c.id === id ? { ...c, nome } : c)))

  const handleSalva = async (id: string) => {
    const conto = conti.find((c) => c.id === id)
    if (!conto) return
    // Campo svuotato (spesso per sbaglio, selezionando e cancellando): non si salva
    // zero in silenzio, si ripristina il valore salvato e si lascia stare.
    if ((saldiStr[id] ?? '').trim() === '' || (fidiStr[id] ?? '').trim() === '') {
      setSaldiStr((cur) => ({ ...cur, [id]: String(conto.saldoSalvato) }))
      setFidiStr((cur) => ({ ...cur, [id]: String(conto.fidoSalvato) }))
      return
    }
    const saldo = parseSaldo(saldiStr[id] ?? '')
    const fido = parseFido(fidiStr[id] ?? '')
    if (
      conto.nome.trim() === conto.nomeSalvato &&
      saldo === conto.saldoSalvato &&
      fido === conto.fidoSalvato
    ) return
    if (!conto.nome.trim()) { toast.error('Il nome del conto è obbligatorio'); return }
    try {
      await updateConto(id, { nome: conto.nome, saldo_attuale: saldo, fido_accordato: fido })
      setConti((cur) =>
        cur.map((c) => (c.id === id
          ? { ...c, saldo_attuale: saldo, fido_accordato: fido, nomeSalvato: c.nome.trim(), saldoSalvato: saldo, fidoSalvato: fido }
          : c))
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
      const fido = parseFido(nuovoFido)
      const { id } = await createConto({ nome: nuovoNome, saldo_attuale: saldo, fido_accordato: fido })
      const nuovo: ContoCorrente = {
        id, organization_id: '', nome: nuovoNome.trim(), saldo_attuale: saldo, fido_accordato: fido,
        ordine: 0, created_at: '', updated_at: '',
      }
      setConti((cur) => [...cur, toRow(nuovo)])
      setSaldiStr((cur) => ({ ...cur, [id]: String(saldo) }))
      setFidiStr((cur) => ({ ...cur, [id]: String(fido) }))
      setNuovoNome('')
      setNuovoSaldo('')
      setNuovoFido('')
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

      {conti.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-0.5">
          <span className="flex-1">Banca / conto</span>
          <span className="w-36 shrink-0 text-right">Disponibilità</span>
          <span className="w-36 shrink-0 text-right">Fido accordato</span>
          <span className="w-9 shrink-0" />
          <span className="w-9 shrink-0" />
        </div>
      )}

      {conti.map((c) => {
        const dirty =
          c.nome.trim() !== c.nomeSalvato ||
          parseSaldo(saldiStr[c.id] ?? '') !== c.saldoSalvato ||
          parseFido(fidiStr[c.id] ?? '') !== c.fidoSalvato
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
                placeholder="Disponibilità 0,00"
                aria-label="Disponibilità"
                onChange={(e) => setSaldiStr((cur) => ({ ...cur, [c.id]: e.target.value }))}
                onBlur={() => handleSalva(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="text-right pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
            </div>
            <div className="relative w-36 shrink-0">
              <Input
                type="number"
                step={0.01}
                value={fidiStr[c.id] ?? ''}
                placeholder="Fido 0,00"
                title="Fido accordato dalla banca"
                aria-label="Fido accordato"
                min={0}
                onChange={(e) => setFidiStr((cur) => ({ ...cur, [c.id]: e.target.value }))}
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
            placeholder="Disponibilità 0,00"
            aria-label="Disponibilità"
            onChange={(e) => setNuovoSaldo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            className="text-right pr-7"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">€</span>
        </div>
        <div className="relative w-36 shrink-0">
          <Input
            type="number"
            step={0.01}
            value={nuovoFido}
            placeholder="Fido 0,00"
            title="Fido accordato dalla banca"
            aria-label="Fido accordato"
            min={0}
            onChange={(e) => setNuovoFido(e.target.value)}
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
