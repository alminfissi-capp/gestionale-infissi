'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { parseCSVListino } from '@/lib/parsers/parseCSVListino'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { GrigliaData } from '@/types/listino'

interface Props {
  onParsed: (data: GrigliaData) => void
}

export default function ImportCSV({ onParsed }: Props) {
  const [csvText, setCsvText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const parse = (text: string) => {
    const result = parseCSVListino(text)
    setErrors(result.errors)
    if (result.altezze.length > 0 && result.larghezze.length > 0) {
      onParsed({ larghezze: result.larghezze, altezze: result.altezze, griglia: result.griglia })
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    parse(text)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleTextChange = (text: string) => {
    setCsvText(text)
    if (text.trim()) parse(text)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1" />
          Carica file .csv
        </Button>
        <span className="text-xs text-gray-400">oppure incolla il testo sotto</span>
        <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
      </div>

      <Textarea
        placeholder={`Formato atteso (separatore ; o ,):\nALT;600;700;800;900\n1200;250;270;290;310\n1300;260;280;300;320`}
        value={csvText}
        onChange={(e) => handleTextChange(e.target.value)}
        rows={6}
        className="font-mono text-xs resize-none"
      />

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">⚠ {e}</p>
          ))}
        </div>
      )}
    </div>
  )
}
