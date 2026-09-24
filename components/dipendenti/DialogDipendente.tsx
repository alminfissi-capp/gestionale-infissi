'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createDipendente, updateDipendente } from '@/actions/dipendenti'
import type { Dipendente, DipendenteInput, RuoloDipendente } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendente: Dipendente | null
  onSaved?: (d: Dipendente) => void
}

const emptyForm = (): DipendenteInput => ({
  nome: '',
  cognome: '',
  codice_fiscale: null,
  iban: null,
  ruolo: 'dipendente',
  riceve_busta_paga: true,
  attivo: true,
  note: null,
})

const RUOLI: { value: RuoloDipendente; label: string }[] = [
  { value: 'dipendente', label: 'Dipendente' },
  { value: 'amministratore', label: 'Amministratore' },
]

export default function DialogDipendente({ open, onOpenChange, dipendente, onSaved }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<DipendenteInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        dipendente
          ? {
              nome: dipendente.nome,
              cognome: dipendente.cognome,
              codice_fiscale: dipendente.codice_fiscale,
              iban: dipendente.iban,
              ruolo: dipendente.ruolo,
              riceve_busta_paga: dipendente.riceve_busta_paga,
              attivo: dipendente.attivo,
              note: dipendente.note,
            }
          : emptyForm(),
      )
    }
  }, [open, dipendente])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.cognome.trim()) {
      toast.error('Nome e cognome sono obbligatori')
      return
    }
    setLoading(true)
    try {
      if (dipendente) {
        await updateDipendente(dipendente.id, form)
        toast.success('Dipendente aggiornato')
        onSaved?.({ ...dipendente, ...form })
      } else {
        const nuovo = await createDipendente(form)
        toast.success('Dipendente creato')
        onSaved?.(nuovo)
      }
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md xl:max-w-xl">
        <DialogHeader>
          <DialogTitle>{dipendente ? 'Modifica dipendente' : 'Nuovo dipendente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dip-nome">Nome *</Label>
              <Input
                id="dip-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dip-cognome">Cognome *</Label>
              <Input
                id="dip-cognome"
                value={form.cognome}
                onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dip-cf">Codice fiscale</Label>
            <Input
              id="dip-cf"
              value={form.codice_fiscale ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, codice_fiscale: e.target.value.toUpperCase() || null }))
              }
              placeholder="Aiuta il riconoscimento automatico delle buste"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dip-iban">IBAN</Label>
            <Input
              id="dip-iban"
              value={form.iban ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value.toUpperCase() || null }))}
              placeholder="Aiuta il riconoscimento dei bonifici"
            />
          </div>
          <div className="space-y-1">
            <Label>Ruolo</Label>
            <div className="flex gap-4 pt-1">
              {RUOLI.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="dip-ruolo"
                    checked={form.ruolo === r.value}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        ruolo: r.value,
                        // Un amministratore di norma preleva compensi senza cedolino:
                        // si parte da li', ma resta cambiabile qui sotto.
                        riceve_busta_paga: r.value === 'dipendente' ? true : f.riceve_busta_paga,
                      }))
                    }
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.riceve_busta_paga}
              onChange={(e) => setForm((f) => ({ ...f, riceve_busta_paga: e.target.checked }))}
            />
            <span>
              Riceve busta paga
              <span className="block text-xs text-gray-500">
                Se disattivo, per questa persona registri solo i compensi pagati: niente
                buste, niente dovuto e niente residuo.
              </span>
            </span>
          </label>

          <div className="space-y-1">
            <Label htmlFor="dip-note">Note</Label>
            <Input
              id="dip-note"
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.attivo}
              onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))}
            />
            Dipendente attivo
          </label>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Salvataggio...' : 'Salva'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
