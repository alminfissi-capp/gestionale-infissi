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
      {/* Il tasto Salva sta in un piede fisso: sul telefono il pannello e' piu' alto dello
          schermo e, in fondo al contenuto, finiva sotto la barra di sistema. */}
      <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col gap-0 rounded-t-2xl p-0">
        <SheetHeader className="shrink-0 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4" />
            Firma del ricevente
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {/* Firma default */}
        {firmaDefault && (
          <div className="mb-3 border rounded-lg p-3 bg-gray-50">
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
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {firmaDefault ? 'Oppure traccia una nuova firma:' : 'Traccia la firma con il dito:'}
            </p>
            <SignaturePad onChange={setFirmaCanvas} />
          </div>
        )}
        </div>

        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className="w-full"
          disabled={saving || !firmaScelta}
          onClick={handleSalva}
        >
          {saving ? 'Salvataggio...' : 'Salva e applica'}
        </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
