'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PenLine, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import SignaturePad from '@/components/ui/SignaturePad'
import { salvaFirmaAcconto } from '@/actions/commesse'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  accontoId: string
  firmaDefault: string | null
  onFirmaSalvata: (base64: string) => void
}

export default function DrawerFirmaRicevuta({
  open,
  onOpenChange,
  accontoId,
  firmaDefault,
  onFirmaSalvata,
}: Props) {
  const [firmaCanvas, setFirmaCanvas] = useState<string | null>(null)
  const [usaDefault, setUsaDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  const firmaScelta = usaDefault ? firmaDefault : firmaCanvas

  const handleSalva = async () => {
    if (!firmaScelta) {
      toast.error('Traccia la firma prima di salvare')
      return
    }
    setSaving(true)
    try {
      await salvaFirmaAcconto(accontoId, firmaScelta)
      onFirmaSalvata(firmaScelta)
      onOpenChange(false)
      toast.success('Firma salvata')
    } catch {
      toast.error('Errore nel salvataggio della firma')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Firma del ricevente
          </SheetTitle>
        </SheetHeader>

        {/* Firma default */}
        {firmaDefault && (
          <div className="mb-4 border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Firma predefinita
            </p>
            { }
            <img
              src={firmaDefault}
              alt="Firma predefinita"
              className="h-12 object-contain"
            />
            <Button
              type="button"
              variant={usaDefault ? 'default' : 'outline'}
              size="sm"
              className="mt-2 w-full"
              onClick={() => setUsaDefault(!usaDefault)}
            >
              {usaDefault ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Selezionata</>
              ) : (
                'Usa questa firma'
              )}
            </Button>
          </div>
        )}

        {/* Canvas */}
        {!usaDefault && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {firmaDefault ? 'Oppure traccia una nuova firma:' : 'Traccia la firma con il dito:'}
            </p>
            <SignaturePad onChange={setFirmaCanvas} />
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={saving || !firmaScelta}
          onClick={handleSalva}
        >
          {saving ? 'Salvataggio...' : 'Salva e applica'}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
