'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Image as IconaImmagine, Share2 } from 'lucide-react'
import { db } from '@/lib/db'
import { AREE } from './aree'
import type { AreaCondivisione, FileCondiviso } from '@/types/condivisione'

/** Dimensione leggibile, per far capire subito se è il file giusto. */
function dimensione(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImbutoCondivisione({ errore }: { errore?: string }) {
  const router = useRouter()
  const [area, setArea] = useState<AreaCondivisione | null>(null)

  // useLiveQuery: se la condivisione arriva mentre la pagina è già aperta
  // (redirect del service worker su una scheda viva) il file compare da solo.
  const record = useLiveQuery(() => db.condivisioni.orderBy('createdAt').last(), [])

  if (errore === 'sw') {
    return (
      <Avviso titolo="Condivisione non completata">
        WinStudio era appena stato aggiornato e non era pronto a ricevere il file.
        Riapri l&apos;app e condividi di nuovo: è l&apos;unica volta che serve.
      </Avviso>
    )
  }

  if (errore === 'lettura') {
    return (
      <Avviso titolo="File non leggibile">
        Non è stato possibile leggere il file condiviso. Riprova dall&apos;app di
        origine, oppure caricalo dalla scheda della commessa.
      </Avviso>
    )
  }

  if (record === undefined) {
    return <p className="text-sm text-gray-400 py-8 text-center">Caricamento...</p>
  }

  if (!record) {
    return (
      <Avviso titolo="Nessun file da smistare">
        Questa pagina si apre da sola quando condividi un PDF o una foto verso
        WinStudio dal tuo dispositivo Android. Per farlo, WinStudio dev&apos;essere
        installato come app dalla schermata home.
      </Avviso>
    )
  }

  const file: FileCondiviso = {
    id: record.id!,
    nome: record.nome,
    tipo: record.tipo,
    blob: record.blob,
    createdAt: record.createdAt,
  }

  const chiudi = async () => {
    await db.condivisioni.clear()
    router.push('/produzione')
  }

  const Icona = file.tipo.startsWith('image/') ? IconaImmagine : FileText

  return (
    <div className="space-y-4">
      {/* Il file in cima, sempre visibile: dice cosa stai smistando */}
      <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
        <Icona className="h-8 w-8 text-teal-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{file.nome}</p>
          <p className="text-xs text-gray-500">{dimensione(file.blob.size)}</p>
        </div>
      </div>

      {area ? (
        <area.Passi file={file} onFatto={chiudi} onIndietro={() => setArea(null)} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Dove lo salvo?</p>
          {AREE.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setArea(a)}
              className="w-full flex items-center gap-3 rounded-lg border bg-white p-3 text-left hover:bg-gray-50"
            >
              <a.icona className="h-5 w-5 text-teal-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{a.label}</p>
                <p className="text-xs text-gray-500">{a.descrizione}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Avviso({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center space-y-2">
      <Share2 className="h-8 w-8 text-gray-300 mx-auto" />
      <p className="text-sm font-semibold text-gray-800">{titolo}</p>
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  )
}
