'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validaFileFornitore } from '@/lib/conferme-ordine'

type Props = {
  token: string
  tipo: 'conferma' | 'documento'
  titolo: string
  descrizione: string
  /** File gia' caricati di questo tipo, dal piu' vecchio. */
  caricati: { nome: string; caricatoAt: string }[]
}

const formattaData = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

async function caricaUno(token: string, tipo: Props['tipo'], file: File): Promise<string | null> {
  const contentType = file.type || 'application/octet-stream'
  const errore = validaFileFornitore(contentType, file.size)
  if (errore) return `${file.name}: ${errore}`

  const prep = await fetch(`/o/${token}/carica`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, nome: file.name, contentType, dimensione: file.size }),
  })
  const datiPrep = (await prep.json().catch(() => ({}))) as {
    path?: string; uploadToken?: string; error?: string
  }
  if (!prep.ok || !datiPrep.path || !datiPrep.uploadToken) {
    return `${file.name}: ${datiPrep.error ?? 'caricamento non riuscito'}`
  }

  // Il file va direttamente su Storage: dal server non passerebbe sopra i ~4,5 MB.
  const { error } = await createClient()
    .storage.from('commesse-docs')
    .uploadToSignedUrl(datiPrep.path, datiPrep.uploadToken, file, { contentType })
  if (error) return `${file.name}: caricamento non riuscito`

  const reg = await fetch(`/o/${token}/registra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, path: datiPrep.path, nome: file.name }),
  })
  if (!reg.ok) {
    const d = (await reg.json().catch(() => ({}))) as { error?: string }
    return `${file.name}: ${d.error ?? 'registrazione non riuscita'}`
  }
  return null
}

export default function CaricaFile({ token, tipo, titolo, descrizione, caricati }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [trascinando, setTrascinando] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [errori, setErrori] = useState<string[]>([])
  const [esito, setEsito] = useState<string | null>(null)
  const inputId = `carica-${tipo}`

  const carica = async (lista: FileList | null) => {
    const files = Array.from(lista ?? [])
    if (files.length === 0 || inCorso) return
    setInCorso(true)
    setErrori([])
    setEsito(null)
    const nuoviErrori: string[] = []
    let riusciti = 0
    for (const f of files) {
      try {
        const e = await caricaUno(token, tipo, f)
        if (e) nuoviErrori.push(e)
        else riusciti++
      } catch {
        nuoviErrori.push(`${f.name}: caricamento non riuscito`)
      }
    }
    setErrori(nuoviErrori)
    if (riusciti > 0) {
      setEsito(
        tipo === 'conferma'
          ? 'Conferma ricevuta. Vi rimanderemo la copia firmata.'
          : riusciti === 1 ? 'File ricevuto.' : `${riusciti} file ricevuti.`
      )
      router.refresh()
    }
    if (inputRef.current) inputRef.current.value = ''
    setInCorso(false)
  }

  return (
    <section id={tipo} className="scroll-mt-4 space-y-3 border-t border-gray-200 pt-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{titolo}</h2>
        <p className="text-sm text-gray-600">{descrizione}</p>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setTrascinando(true) }}
        onDragLeave={() => setTrascinando(false)}
        onDrop={(e) => { e.preventDefault(); setTrascinando(false); void carica(e.dataTransfer.files) }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${
          trascinando ? 'border-[#0E8F9C] bg-[#0E8F9C]/10' : 'border-[#0E8F9C]/60 bg-[#0E8F9C]/5 hover:bg-[#0E8F9C]/10'
        } ${inCorso ? 'pointer-events-none opacity-60' : ''}`}
      >
        <span className="font-medium text-[#0E8F9C]">
          {inCorso ? 'Caricamento in corso…' : 'Tocca per scegliere il file o trascinalo qui'}
        </span>
        <span className="text-xs text-gray-500">PDF, JPG o PNG · fino a 20 MB</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple={tipo === 'documento'}
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void carica(e.target.files)}
      />

      {esito ? <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{esito}</p> : null}
      {errori.length > 0 ? (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {errori.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}

      {caricati.length > 0 ? (
        <ul className="space-y-1.5">
          {caricati.map((f, i) => (
            <li key={`${f.nome}-${f.caricatoAt}-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-900">{f.nome}</span>
              <span className="shrink-0 text-xs text-gray-500">{formattaData(f.caricatoAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
