'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createCliente } from '@/actions/clienti'
import StepCliente from '@/components/preventivi/StepCliente'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { db } from '@/lib/db'
import { clienteDaRegistrare, snapshotDalModulo, snapshotPerModulo } from '@/lib/rilievo-cliente'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { ClienteSnapshot } from '@/types/preventivo'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

const VUOTO: ClienteSnapshot = {
  tipo: 'privato', ragione_sociale: null, nome: null, cognome: null, telefono: null, email: null, indirizzo: null,
  via: null, civico: null, cap: null, citta: null, provincia: null, nazione: null, codice_sdi: null, cantiere: null, cf_piva: null,
}

/**
 * Cliente del rilievo con lo stesso modulo dei preventivi: ricerca in anagrafica (clienti gia'
 * nel dispositivo, quindi anche senza rete) o scheda completa. Un cliente nuovo, con la rete,
 * entra subito in anagrafica; senza rete lo registra il trasferimento in Preventivi.
 */
export default function ClienteRilievo({ aperto, iniziale, titolo, conferma, onChiudi, onConferma }: {
  aperto: boolean
  iniziale: ClienteSnapshotRilievo | null
  titolo: string
  conferma: string
  onChiudi: () => void
  onConferma: (c: ClienteSnapshotRilievo) => Promise<void> | void
}) {
  const clienti = useLiveQuery(() => db.clienti.toArray(), [], [])
  const { isOnline } = useOnlineStatus()
  const [clienteId, setClienteId] = useState<string | null>(iniziale?.clienteId ?? null)
  const [snapshot, setSnapshot] = useState<ClienteSnapshot>(() => (iniziale ? snapshotPerModulo(iniziale) : VUOTO))
  const [salvando, setSalvando] = useState(false)

  const conferma_ = async () => {
    let c = snapshotDalModulo(snapshot, clienteId)
    const haNome = c.tipo === 'azienda' ? !!c.ragione_sociale : !!(c.nome || c.cognome)
    if (!haNome) { toast.error(c.tipo === 'azienda' ? 'Scrivi la ragione sociale' : 'Scrivi almeno nome o cognome'); return }
    setSalvando(true)
    try {
      if (clienteDaRegistrare(c, isOnline)) {
        try {
          const { id } = await createCliente({
            tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, telefono: c.telefono, email: c.email,
            via: c.via, civico: c.civico, cap: c.cap, citta: c.citta, provincia: c.provincia, nazione: c.nazione,
            codice_sdi: c.codice_sdi, cantiere: c.cantiere, cf_piva: c.cf_piva,
          })
          c = { ...c, clienteId: id }
          const ora = new Date().toISOString()
          await db.clienti.put({
            id, organization_id: '', tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome,
            telefono: c.telefono, email: c.email, indirizzo: c.indirizzo, via: c.via ?? null, civico: c.civico ?? null, cap: c.cap ?? null,
            citta: c.citta ?? null, provincia: c.provincia ?? null, nazione: c.nazione ?? null, codice_sdi: c.codice_sdi ?? null,
            cantiere: c.cantiere, cf_piva: c.cf_piva ?? null, note: null, created_at: ora, updated_at: ora,
          })
          toast.success('Cliente registrato in anagrafica')
        } catch {
          toast.warning('Cliente non registrato ora: lo sarà al trasferimento in Preventivi')
        }
      }
      await onConferma(c)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={o => { if (!o) onChiudi() }}>
      <DialogContent className="flex max-h-[100dvh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3"><DialogTitle>{titolo}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <StepCliente clienti={clienti} clienteId={clienteId} clienteSnapshot={snapshot} numero=""
            onClienteIdChange={setClienteId} onSnapshotChange={setSnapshot} onNumeroChange={() => {}} showNumero={false} />
          {!clienteId && (
            <p className="mt-2 text-xs text-muted-foreground">
              {isOnline ? 'Cliente nuovo: viene registrato subito in anagrafica.' : 'Senza rete: il cliente nuovo verrà registrato in anagrafica al trasferimento in Preventivi.'}
            </p>
          )}
        </div>
        <DialogFooter className="border-t px-4 py-3">
          <Button variant="ghost" className="h-11" onClick={onChiudi}>Annulla</Button>
          <Button className="h-11" disabled={salvando} onClick={() => void conferma_()}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}{conferma}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
