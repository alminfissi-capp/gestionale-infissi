'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SignaturePad from '@/components/ui/SignaturePad'
import { salvaFirmaDefault } from '@/actions/impostazioni'

interface Props {
  firmaDefault: string | null
}

export default function SezioneFirmaDefault({ firmaDefault: initialFirma }: Props) {
  const [firma, setFirma] = useState<string | null>(initialFirma)
  const [nuovaFirma, setNuovaFirma] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSalva = async () => {
    if (!nuovaFirma) return
    setSaving(true)
    try {
      await salvaFirmaDefault(nuovaFirma)
      setFirma(nuovaFirma)
      setNuovaFirma(null)
      toast.success('Firma predefinita salvata')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const handleElimina = async () => {
    if (!confirm('Eliminare la firma predefinita?')) return
    setSaving(true)
    try {
      await salvaFirmaDefault(null)
      setFirma(null)
      toast.success('Firma eliminata')
    } catch {
      toast.error('Errore eliminazione')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {firma && (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
          { }
          <img src={firma} alt="Firma corrente" className="h-10 object-contain flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0"
            onClick={handleElimina}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2">
          {firma ? 'Traccia una nuova firma per sostituirla:' : 'Traccia la firma con il dito o il mouse:'}
        </p>
        <SignaturePad onChange={setNuovaFirma} />
      </div>

      <Button
        type="button"
        disabled={!nuovaFirma || saving}
        onClick={handleSalva}
        size="sm"
      >
        {saving ? 'Salvataggio...' : 'Salva firma predefinita'}
      </Button>
    </div>
  )
}
