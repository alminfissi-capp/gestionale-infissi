'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, GripVertical, ChevronDown, Save, X } from 'lucide-react'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Testo al momento dell'apertura: serve per annullare le modifiche con "Chiudi"
  const [snapshot, setSnapshot] = useState('')

  const addTemplate = () => {
    const id = crypto.randomUUID()
    setTemplates((prev) => [...prev, { id, testo: '' }])
    setSnapshot('')
    setExpandedId(id)
  }

  const updateTemplate = (id: string, testo: string) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, testo } : t)))
  }

  const removeTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const expand = (id: string, testo: string) => {
    setSnapshot(testo)
    setExpandedId(id)
  }

  // Chiudi senza salvare: ripristina il testo originale; rimuove la riga se resta vuota
  const collapseDiscard = () => {
    if (expandedId) {
      const id = expandedId
      setTemplates((prev) =>
        prev
          .map((t) => (t.id === id ? { ...t, testo: snapshot } : t))
          .filter((t) => t.id !== id || t.testo.trim().length > 0)
      )
    }
    setExpandedId(null)
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
      setExpandedId(null)
    } catch {
      toast.error('Errore nel salvataggio dei template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {templates.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Nessun template. Aggiungine uno per pre-compilare il campo note nei preventivi.
        </p>
      )}

      {templates.map((template, index) => {
        const isExpanded = expandedId === template.id
        const firstLine = (template.testo.split('\n')[0] ?? '').trim()

        return (
          <div key={template.id} className="flex gap-2 items-start rounded-md border p-2">
            <div className="mt-1.5 text-gray-300 cursor-grab shrink-0">
              <GripVertical className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              {isExpanded ? (
                <div className="space-y-2">
                  <Textarea
                    value={template.testo}
                    onChange={(e) => updateTemplate(template.id, e.target.value)}
                    placeholder={`Template ${index + 1}...`}
                    rows={5}
                    autoFocus
                    className="resize-y"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? 'Salvataggio...' : 'Salva'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={collapseDiscard} disabled={saving}>
                      <X className="h-4 w-4 mr-1" />
                      Chiudi
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => expand(template.id, template.testo)}
                  className="flex items-center gap-2 w-full text-left py-1.5 group"
                >
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 group-hover:text-gray-600" />
                  <span className={`text-sm truncate ${firstLine ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                    {firstLine || '(vuoto) — clicca per modificare'}
                  </span>
                </button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 text-gray-400 hover:text-red-600 shrink-0"
              onClick={() => removeTemplate(template.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

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
