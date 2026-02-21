'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { saveNoteTemplates } from '@/actions/impostazioni'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { NoteTemplate } from '@/types/impostazioni'

interface Props {
  initialTemplates: NoteTemplate[]
}

export default function TemplateNote({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<{ id: string; testo: string }[]>(
    initialTemplates.map((t) => ({ id: t.id, testo: t.testo }))
  )
  const [saving, setSaving] = useState(false)

  const addTemplate = () => {
    setTemplates((prev) => [...prev, { id: crypto.randomUUID(), testo: '' }])
  }

  const updateTemplate = (id: string, testo: string) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, testo } : t)))
  }

  const removeTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  const handleSave = async () => {
    const valid = templates.filter((t) => t.testo.trim().length > 0)
    if (valid.length !== templates.length) {
      toast.error('Rimuovi i template vuoti prima di salvare')
      return
    }

    setSaving(true)
    try {
      await saveNoteTemplates(valid.map((t, i) => ({ testo: t.testo, ordine: i })))
      toast.success('Template note salvati')
    } catch {
      toast.error('Errore nel salvataggio dei template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {templates.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessun template. Aggiungine uno per pre-compilare il campo note nei preventivi.
        </p>
      )}

      {templates.map((template, index) => (
        <div key={template.id} className="flex gap-2 items-start">
          <div className="mt-2 text-gray-300 cursor-grab">
            <GripVertical className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <Textarea
              value={template.testo}
              onChange={(e) => updateTemplate(template.id, e.target.value)}
              placeholder={`Template ${index + 1}...`}
              rows={2}
              className="resize-none"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 text-gray-400 hover:text-red-600 shrink-0"
            onClick={() => removeTemplate(template.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addTemplate}>
          <Plus className="h-4 w-4 mr-1" />
          Aggiungi template
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva template'}
        </Button>
      </div>
    </div>
  )
}
