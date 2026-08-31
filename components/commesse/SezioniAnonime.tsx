'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteSezioneAnonima, deleteVenditaAnonima } from '@/actions/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import SezioneAnonimaCard from './SezioneAnonimaCard'
import DialogSezioneAnonima from './DialogSezioneAnonima'
import DialogVenditaAnonima from './DialogVenditaAnonima'
import type { SezioneAnonima, SezioneConVendite, VenditaAnonima } from '@/types/commessa'

interface Props {
  gruppoId: string
  sezioni: SezioneConVendite[]
}

/**
 * Le vendite online (e-commerce, eBay) di un blocco anno.
 *
 * Il riquadro esiste solo se l'utente ha creato almeno una sezione: negli anni
 * senza vendite online la pagina resta identica a prima, senza contenitori vuoti.
 */
export default function SezioniAnonime({ gruppoId, sezioni }: Props) {
  const router = useRouter()
  // I dialoghi sono montati solo quando servono: si aprono con lo stato giusto
  // senza un useEffect che lo reimposti a ogni apertura.
  const [dialogSezione, setDialogSezione] = useState<{ sezione: SezioneAnonima | null } | null>(null)
  const [dialogVendita, setDialogVendita] =
    useState<{ sezioneId: string; vendita: VenditaAnonima | null } | null>(null)
  const [sezioneDaEliminare, setSezioneDaEliminare] = useState<SezioneConVendite | null>(null)
  const [venditaDaEliminare, setVenditaDaEliminare] = useState<VenditaAnonima | null>(null)

  const confermaEliminaSezione = async () => {
    if (!sezioneDaEliminare) return
    try {
      await deleteSezioneAnonima(sezioneDaEliminare.id)
      toast.success('Sezione eliminata')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSezioneDaEliminare(null)
    }
  }

  const confermaEliminaVendita = async () => {
    if (!venditaDaEliminare) return
    try {
      await deleteVenditaAnonima(venditaDaEliminare.id)
      toast.success('Vendita eliminata')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setVenditaDaEliminare(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-indigo-700 flex items-center gap-2 uppercase tracking-wide">
          <ShoppingCart className="h-4 w-4" />
          Commesse anonime
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-indigo-700"
          onClick={() => setDialogSezione({ sezione: null })}
        >
          <Plus className="h-4 w-4 mr-1" />
          Commesse anonime
        </Button>
      </div>

      {sezioni.map((s) => (
        <SezioneAnonimaCard
          key={s.id}
          sezione={s}
          onRinomina={() => setDialogSezione({ sezione: s })}
          onElimina={() => setSezioneDaEliminare(s)}
          onNuovaVendita={() => setDialogVendita({ sezioneId: s.id, vendita: null })}
          onModificaVendita={(v) => setDialogVendita({ sezioneId: s.id, vendita: v })}
          onEliminaVendita={(v) => setVenditaDaEliminare(v)}
        />
      ))}

      {dialogSezione && (
        <DialogSezioneAnonima
          gruppoId={gruppoId}
          sezione={dialogSezione.sezione}
          onClose={() => setDialogSezione(null)}
        />
      )}

      {dialogVendita && (
        <DialogVenditaAnonima
          sezioneId={dialogVendita.sezioneId}
          vendita={dialogVendita.vendita}
          onClose={() => setDialogVendita(null)}
        />
      )}

      <AlertDialog
        open={sezioneDaEliminare !== null}
        onOpenChange={(v) => { if (!v) setSezioneDaEliminare(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la sezione?</AlertDialogTitle>
            <AlertDialogDescription>
              «{sezioneDaEliminare?.nome}» verrà eliminata. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confermaEliminaSezione}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={venditaDaEliminare !== null}
        onOpenChange={(v) => { if (!v) setVenditaDaEliminare(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la vendita?</AlertDialogTitle>
            <AlertDialogDescription>
              {venditaDaEliminare
                ? `${venditaDaEliminare.descrizione || 'Vendita'} da ${formatEuro(venditaDaEliminare.lordo)}: l'incasso uscirà da fatturato e flusso di cassa.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confermaEliminaVendita}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
