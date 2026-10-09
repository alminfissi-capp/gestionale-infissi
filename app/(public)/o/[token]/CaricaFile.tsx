'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { tipoFileFornitore, validaFileFornitore } from '@/lib/conferme-ordine'

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

/** Sotto questa soglia il file puo' passare dal server (tetto Vercel ~4,5 MB, meno il multipart). */
const MAX_RIPIEGO_SERVER = 4 * 1024 * 1024

type FileLetto = { nome: string; contentType: string; dati: Blob } | { nome: string; errore: string }

/**
 * Legge il file in memoria appena scelto. Su Android i file presi da Drive,
 * Gmail o Download sono solo un riferimento: se si aspetta a leggerli (qui
 * c'e' prima una chiamata al server), Chrome interrompe l'invio a meta' e il
 * file non arriva mai a Storage. Letti subito, diventano byte veri.
 */
async function leggiFile(file: File): Promise<FileLetto> {
  const contentType = tipoFileFornitore(file.name, file.type)
  const errore = validaFileFornitore(contentType, file.size)
  if (errore) return { nome: file.name, errore }
  try {
    const dati = new Blob([await file.arrayBuffer()], { type: contentType })
    if (dati.size === 0) return { nome: file.name, errore: 'Il file è vuoto' }
    return { nome: file.name, contentType, dati }
  } catch {
    return {
      nome: file.name,
      errore: 'il telefono non riesce a leggere il file: salvatelo prima sul dispositivo e riprovate',
    }
  }
}

/** Strada principale: il browser carica direttamente su Storage. */
async function caricaDiretto(
  token: string, tipo: Props['tipo'], nome: string, contentType: string, dati: Blob
): Promise<{ esito: 'ok' } | { esito: 'rifiutato'; errore: string } | { esito: 'fallito'; motivo: string }> {
  let prep: Response
  try {
    prep = await fetch(`/o/${token}/carica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, nome, contentType, dimensione: dati.size }),
    })
  } catch (e) {
    return { esito: 'fallito', motivo: `prepara: ${e instanceof Error ? e.message : String(e)}` }
  }
  const datiPrep = (await prep.json().catch(() => ({}))) as {
    path?: string; uploadToken?: string; error?: string
  }
  if (!prep.ok || !datiPrep.path || !datiPrep.uploadToken) {
    // Un no motivato (formato, troppi file, ordine sparito) vale anche per il ripiego.
    if (prep.status >= 400 && prep.status < 500 && datiPrep.error) {
      return { esito: 'rifiutato', errore: datiPrep.error }
    }
    return { esito: 'fallito', motivo: `prepara: HTTP ${prep.status}` }
  }

  // Il file va direttamente su Storage: dal server non passerebbe sopra i ~4,5 MB.
  try {
    const { error } = await createClient()
      .storage.from('commesse-docs')
      .uploadToSignedUrl(datiPrep.path, datiPrep.uploadToken, dati, { contentType })
    if (error) return { esito: 'fallito', motivo: `storage: ${error.message}` }
  } catch (e) {
    return { esito: 'fallito', motivo: `storage: ${e instanceof Error ? e.message : String(e)}` }
  }

  const reg = await fetch(`/o/${token}/registra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, path: datiPrep.path, nome }),
  })
  if (!reg.ok) {
    const d = (await reg.json().catch(() => ({}))) as { error?: string }
    return { esito: 'rifiutato', errore: d.error ?? 'registrazione non riuscita' }
  }
  return { esito: 'ok' }
}

/** Ripiego: il file passa dal nostro server (solo file piccoli). */
async function caricaDalServer(
  token: string, tipo: Props['tipo'], nome: string, dati: Blob, motivo: string
): Promise<string | null> {
  const form = new FormData()
  form.append('tipo', tipo)
  form.append('nome', nome)
  form.append('motivo', motivo)
  form.append('file', dati, nome)
  const res = await fetch(`/o/${token}/carica-server`, { method: 'POST', body: form })
  if (res.ok) return null
  const d = (await res.json().catch(() => ({}))) as { error?: string }
  return d.error ?? 'caricamento non riuscito'
}

async function caricaUno(token: string, tipo: Props['tipo'], file: FileLetto): Promise<string | null> {
  if ('errore' in file) return `${file.nome}: ${file.errore}`
  const { nome, contentType, dati } = file

  const diretto = await caricaDiretto(token, tipo, nome, contentType, dati)
  if (diretto.esito === 'ok') return null
  if (diretto.esito === 'rifiutato') return `${nome}: ${diretto.errore}`

  if (dati.size > MAX_RIPIEGO_SERVER) {
    return `${nome}: caricamento non riuscito, controllate la connessione e riprovate`
  }
  const errore = await caricaDalServer(token, tipo, nome, dati, diretto.motivo)
  return errore ? `${nome}: ${errore}` : null
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
    // Prima si leggono tutti i file, poi si carica: vedi leggiFile.
    const letti = await Promise.all(files.map(leggiFile))
    const nuoviErrori: string[] = []
    let riusciti = 0
    for (const f of letti) {
      try {
        const e = await caricaUno(token, tipo, f)
        if (e) nuoviErrori.push(e)
        else riusciti++
      } catch {
        nuoviErrori.push(`${f.nome}: caricamento non riuscito`)
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
