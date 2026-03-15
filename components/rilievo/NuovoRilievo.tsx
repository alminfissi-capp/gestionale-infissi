'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StepCliente from '@/components/preventivi/StepCliente'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshot } from '@/types/preventivo'

const SNAPSHOT_VUOTO: ClienteSnapshot = {
  tipo: 'privato',
  ragione_sociale: null,
  nome: null,
  cognome: null,
  telefono: null,
  email: null,
  indirizzo: null,
  via: null,
  civico: null,
  cap: null,
  citta: null,
  provincia: null,
  nazione: null,
  codice_sdi: null,
  cantiere: null,
  cf_piva: null,
}

interface Props {
  clienti: Cliente[]
}

export default function NuovoRilievo({ clienti }: Props) {
  const router = useRouter()
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ClienteSnapshot>(SNAPSHOT_VUOTO)

  const nomeCliente = snapshot.tipo === 'azienda'
    ? snapshot.ragione_sociale
    : [snapshot.nome, snapshot.cognome].filter(Boolean).join(' ')

  const clienteValido = snapshot.tipo === 'azienda'
    ? !!snapshot.ragione_sociale?.trim()
    : !!(snapshot.nome?.trim() || snapshot.cognome?.trim())

  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/rilievo">
            <ChevronLeft className="h-4 w-4" />
            Rilievo misure
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nuovo rilievo</h1>
      <p className="text-sm text-gray-500 mb-6">Seleziona o inserisci il cliente per il cantiere</p>

      <div className="bg-white rounded-lg border p-5">
        <StepCliente
          clienti={clienti}
          clienteId={clienteId}
          clienteSnapshot={snapshot}
          numero=""
          onClienteIdChange={setClienteId}
          onSnapshotChange={setSnapshot}
          onNumeroChange={() => {}}
          showNumero={false}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" asChild>
          <Link href="/rilievo">Annulla</Link>
        </Button>
        <Button
          disabled={!clienteValido}
          onClick={() => {
            if (!clienteValido) return
            sessionStorage.setItem('rilievo_cliente_id', clienteId ?? '')
            sessionStorage.setItem('rilievo_snapshot', JSON.stringify(snapshot))
            router.push('/rilievo/nuovo/vani')
          }}
        >
          Continua
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

    </div>
  )
}
