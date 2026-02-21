'use client'

import { useRef, useState } from 'react'
import { Upload, CheckCircle } from 'lucide-react'
import { parseExcelListino } from '@/lib/parsers/parseExcelListino'
import { Button } from '@/components/ui/button'
import type { GrigliaData } from '@/types/listino'

interface Props {
  onParsed: (data: GrigliaData) => void
}

export default function ImportExcel({ onParsed }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('loading')
    setMessage('Elaborazione...')

    try {
      const result = await parseExcelListino(file)

      if (result.errors.length > 0 && result.altezze.length === 0) {
        setStatus('error')
        setMessage(result.errors.join(' — '))
        return
      }

      onParsed({ larghezze: result.larghezze, altezze: result.altezze, griglia: result.griglia })
      setStatus('success')
      setMessage(
        `${result.altezze.length} altezze × ${result.larghezze.length} larghezze importate.` +
          (result.errors.length > 0 ? ` Avvisi: ${result.errors.join('; ')}` : '')
      )
    } catch (err) {
      setStatus('error')
      setMessage('Errore nella lettura del file Excel.')
      console.error(err)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={status === 'loading'}>
          <Upload className="h-4 w-4 mr-1" />
          {status === 'loading' ? 'Elaborazione...' : 'Carica file .xlsx / .xls'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {status === 'success' && (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4" />
          {message}
        </p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600">⚠ {message}</p>
      )}

      <p className="text-xs text-gray-400">
        Prima riga = larghezze (mm), prima colonna = altezze (mm), celle = prezzi.
      </p>
    </div>
  )
}
