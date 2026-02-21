'use client'

import { useRef, useState } from 'react'
import { Upload, CheckCircle } from 'lucide-react'
import { parsePDFToText, pdfTextToCSV } from '@/lib/parsers/parsePDFListino'
import { parseCSVListino } from '@/lib/parsers/parseCSVListino'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { GrigliaData } from '@/types/listino'

interface Props {
  onParsed: (data: GrigliaData) => void
}

type Step = 'idle' | 'extracting' | 'review' | 'done' | 'error'

export default function ImportPDF({ onParsed }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [rawText, setRawText] = useState('')
  const [csvText, setCsvText] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('extracting')

    try {
      const text = await parsePDFToText(file)
      const csv = pdfTextToCSV(text)
      setRawText(text)
      setCsvText(csv)
      setStep('review')
    } catch (err) {
      console.error(err)
      setStep('error')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleApply = () => {
    const result = parseCSVListino(csvText)
    setParseErrors(result.errors)
    if (result.altezze.length > 0 && result.larghezze.length > 0) {
      onParsed({ larghezze: result.larghezze, altezze: result.altezze, griglia: result.griglia })
      setStep('done')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={step === 'extracting'}
        >
          <Upload className="h-4 w-4 mr-1" />
          {step === 'extracting' ? 'Estrazione testo...' : 'Carica file .pdf'}
        </Button>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
      </div>

      {step === 'error' && (
        <p className="text-sm text-red-600">⚠ Errore nell&apos;estrazione del testo dal PDF.</p>
      )}

      {(step === 'review' || step === 'done') && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              CSV generato — modifica se necessario, poi clicca &quot;Usa questo CSV&quot;:
            </p>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              className="font-mono text-xs resize-none"
            />
          </div>

          {parseErrors.length > 0 && (
            <div>
              {parseErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">⚠ {e}</p>
              ))}
            </div>
          )}

          {step === 'done' ? (
            <p className="text-sm text-green-700 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" />
              Griglia importata con successo.
            </p>
          ) : (
            <Button size="sm" onClick={handleApply}>
              Usa questo CSV
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Il testo estratto dal PDF viene convertito in CSV. Verifica e correggi il CSV prima di applicare.
      </p>
    </div>
  )
}
