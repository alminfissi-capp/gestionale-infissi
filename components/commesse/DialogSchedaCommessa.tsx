'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Pencil, X, Plus, Trash2, Upload, FileText,
  Eye, Share2, Check, ExternalLink, Printer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  updateCommessa,
  setPreventiviCommessa,
  addAcconto,
  deleteAcconto,
  addDocumentoCommessa,
  deleteDocumentoCommessa,
  getDocumentoCommessaUrl,
  getOrgIdPerUpload,
  type PreventivoCommessaItemInput,
} from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type {
  CommessaCompleta,
  CommessaInput,
  AccontoInput,
  MetodoPagamento,
  StatoCommessa,
  DocumentoCommessa,
  Reparto,
  UtentePerCommessa,
} from '@/types/commessa'
import { REPARTI } from '@/types/commessa'

// ── Costanti ────────────────────────────────────────────────

const STATI: { value: StatoCommessa; label: string; color: string }[] = [
  { value: 'in_attesa',               label: 'In attesa',        color: 'bg-gray-100 text-gray-500 border-gray-200' },
  { value: 'da_iniziare',             label: 'Da iniziare',      color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'in_lavorazione',          label: 'In lavorazione',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'da_consegnare',           label: 'Da consegnare',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'consegnato',              label: 'Consegnato',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'parzialmente_consegnato', label: 'Parz. consegnato', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'concluso',                label: 'Concluso',         color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'bloccato',                label: 'Bloccato',         color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'annullato',               label: 'Annullato',        color: 'bg-red-100 text-red-700 border-red-200' },
]

const METODI: { value: MetodoPagamento; label: string }[] = [
  { value: 'contanti', label: 'Contanti' },
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'riba',     label: 'Ri.Ba.' },
  { value: 'altro',    label: 'Altro' },
]

// ── Helpers ─────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0]

function emptyAcconto(): AccontoInput {
  return { importo: 0, data_pagamento: today(), metodo_pagamento: 'contanti', note: null }
}

function formatData(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT')
}

function formatMese(data: string) {
  const [y, m] = data.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const mese = d.toLocaleDateString('it-IT', { month: 'long' })
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`
}

function commessaToForm(c: CommessaCompleta): CommessaInput {
  return {
    numero_commessa: c.numero_commessa,
    preventivo_id: c.preventivo_id,
    numero_preventivo: c.numero_preventivo,
    cliente_nome: c.cliente_nome,
    imponibile: c.imponibile,
    iva_totale: c.iva_totale,
    totale: c.totale,
    data_conferma: c.data_conferma,
    operatore_id: c.operatore_id,
    operatore_nome: c.operatore_nome,
    note: c.note,
    reparti: c.reparti ?? [],
    costo_materiali_manuale: c.costo_materiali_manuale,
    costo_manodopera_manuale: c.costo_manodopera_manuale,
    utile_manuale: c.utile_manuale,
  }
}

// ── Props ────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa: CommessaCompleta | null
  utenti: UtentePerCommessa[]
}

// ── Componente ───────────────────────────────────────────────

export default function DialogSchedaCommessa({ open, onOpenChange, commessa, utenti }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<CommessaInput | null>(null)
  const [saving, setSaving] = useState(false)

  // Acconti
  const [showAddAcconto, setShowAddAcconto] = useState(false)
  const [newAcconto, setNewAcconto] = useState<AccontoInput>(emptyAcconto())
  const [addingAcconto, setAddingAcconto] = useState(false)
  const [deletingAccontoId, setDeletingAccontoId] = useState<string | null>(null)

  // Documenti
  const [uploading, setUploading] = useState(false)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})

  // Stampa
  const [stampaDialogOpen, setStampaDialogOpen] = useState(false)
  const [stampaDocSelezioni, setStampaDocSelezioni] = useState<string[]>([])

  // Reset all'apertura
  useEffect(() => {
    if (!open || !commessa) return
    setEditMode(false)
    setShowAddAcconto(false)
    setNewAcconto(emptyAcconto())
    setUrlMap({})
    setForm(commessaToForm(commessa))
  }, [open, commessa?.id]) // eslint-disable-line react-hooks/exhaustive-deps


  // Risincronizza form dopo router.refresh() (solo se non in edit mode)
  useEffect(() => {
    if (!commessa || editMode) return
    setForm(commessaToForm(commessa))
  }, [commessa, editMode])

  // Pre-carica URL firmati per i documenti
  useEffect(() => {
    if (!open || !commessa || commessa.documenti.length === 0) return
    let cancelled = false
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        commessa.documenti.map(async (doc) => {
          try { map[doc.id] = await getDocumentoCommessaUrl(doc.storage_path) } catch { /* ignora */ }
        })
      )
      if (!cancelled) setUrlMap(map)
    }
    load()
    return () => { cancelled = true }
  }, [open, commessa?.documenti.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!commessa || !form) return null

  const statoInfo = STATI.find((s) => s.value === commessa.stato) ?? STATI[0]
  const saldoPositivo = commessa.saldo > 0.005
  const saldoZero = !saldoPositivo && commessa.saldo >= -0.005

  // La commessa ha un preventivo caricato a mano (riga junction senza preventivo_id)?
  const haPrevManuale = (commessa.preventivi_collegati ?? []).some((pc) => !pc.preventivo_id)
  const haCostiManualiSalvati =
    commessa.costo_materiali_manuale != null ||
    commessa.costo_manodopera_manuale != null ||
    commessa.utile_manuale != null

  // ── Helpers form ──────────────────────────────────────────

  const setFieldF = (k: keyof CommessaInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => f ? { ...f, [k]: e.target.value || null } : f)

  const setNumber = (k: 'imponibile' | 'iva_totale') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value) || 0
      setForm((f) => {
        if (!f) return f
        const n = { ...f, [k]: v }
        n.totale = n.imponibile + n.iva_totale
        return n
      })
    }

  const setManuale = (k: 'costo_materiali_manuale' | 'costo_manodopera_manuale' | 'utile_manuale') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setForm((f) => f ? { ...f, [k]: raw === '' ? null : (parseFloat(raw) || 0) } : f)
    }

  const setOperatore = (uid: string) => {
    if (uid === '__nessuno__') {
      setForm((f) => f ? { ...f, operatore_id: null, operatore_nome: null } : f)
      return
    }
    const u = utenti.find((u) => u.id === uid)
    setForm((f) => f ? { ...f, operatore_id: uid, operatore_nome: u?.nome ?? null } : f)
  }

  const toggleReparto = (r: Reparto) =>
    setForm((f) => {
      if (!f) return f
      return {
        ...f,
        reparti: f.reparti.includes(r)
          ? f.reparti.filter((x) => x !== r)
          : [...f.reparti, r],
      }
    })

  // ── Salvataggio ───────────────────────────────────────────

  // Sincronizza il numero preventivo digitato nella scheda dentro `preventivi_commessa`,
  // così compare (e diventa cliccabile) nella riga della tabella commesse.
  // Non viene chiamato quando c'è un preventivo di sistema collegato (campo non editabile).
  const buildPreventiviItems = (): PreventivoCommessaItemInput[] => {
    const collegati = commessa.preventivi_collegati ?? []
    const base: PreventivoCommessaItemInput[] = collegati.map((pc, i) => ({
      preventivo_id: pc.preventivo_id,
      numero_preventivo: pc.numero_preventivo,
      storage_path: pc.storage_path,
      nome_file: pc.nome_file,
      ordine: i,
    }))

    const nuovoNumero = form.numero_preventivo?.trim() || null
    if (!nuovoNumero) return base

    // Aggiorna la voce manuale esistente, oppure creane una nuova
    const idx = base.findIndex((b) => b.preventivo_id === null)
    if (idx >= 0) {
      base[idx] = { ...base[idx], numero_preventivo: nuovoNumero }
      return base
    }
    return [...base, {
      preventivo_id: null,
      numero_preventivo: nuovoNumero,
      storage_path: null,
      nome_file: null,
      ordine: base.length,
    }]
  }

  const handleSave = async () => {
    if (!form.cliente_nome?.trim()) { toast.error('Il nome cliente è obbligatorio'); return }
    setSaving(true)
    try {
      await updateCommessa(commessa.id, form)
      // Solo per preventivi non di sistema (manuali): mantieni allineata la tabella preventivi_commessa
      if (!commessa.preventivo_id) {
        await setPreventiviCommessa(commessa.id, buildPreventiviItems())
      }
      toast.success('Commessa aggiornata')
      setEditMode(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setForm(commessaToForm(commessa))
    setEditMode(false)
  }

  const handleCondividi = async () => {
    const righeAcconti = commessa.acconti.map(
      (a) => `• ${formatData(a.data_pagamento)} — ${formatEuro(a.importo)} — ${METODI.find((m) => m.value === a.metodo_pagamento)?.label ?? a.metodo_pagamento}${a.note ? ` (${a.note})` : ''}`
    )
    const parti = [
      `COMMESSA — ${commessa.cliente_nome}`,
      [commessa.numero_commessa && `N. ${commessa.numero_commessa}`, statoInfo.label, formatMese(commessa.data_conferma)].filter(Boolean).join(' · '),
      '',
      commessa.note && `Descrizione: ${commessa.note}`,
      commessa.numero_preventivo && `Preventivo: ${commessa.numero_preventivo}`,
      '',
      `Totale: ${formatEuro(commessa.totale)} (IVA ${formatEuro(commessa.iva_totale)})`,
      ...(commessa.acconti.length > 0 ? ['', 'Pagamenti:', ...righeAcconti, `Totale acconti: ${formatEuro(commessa.totale_acconti)}`] : []),
      '',
      `Saldo: ${formatEuro(commessa.saldo)}`,
    ].filter((r): r is string => typeof r === 'string')

    const text = parti.join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ title: `Commessa — ${commessa.cliente_nome}`, text })
      } else {
        await navigator.clipboard.writeText(text)
        toast.success('Scheda copiata negli appunti')
      }
    } catch { /* annullato */ }
  }

  const handleClickStampa = () => {
    setStampaDocSelezioni(commessa.documenti.map((d) => d.id))
    setStampaDialogOpen(true)
  }


  // ── Acconti ───────────────────────────────────────────────

  const handleAddAcconto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAcconto.importo || newAcconto.importo <= 0) {
      toast.error('Inserisci un importo valido')
      return
    }
    setAddingAcconto(true)
    try {
      await addAcconto(commessa.id, newAcconto)
      toast.success('Acconto registrato')
      setNewAcconto(emptyAcconto())
      setShowAddAcconto(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setAddingAcconto(false)
    }
  }

  const handleDeleteAcconto = async (id: string) => {
    setDeletingAccontoId(id)
    try {
      await deleteAcconto(id)
      toast.success('Acconto eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeletingAccontoId(null)
    }
  }

  // ── Documenti ─────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}" troppo grande (max 20 MB)`)
        continue
      }
      setUploading(true)
      try {
        const orgId = await getOrgIdPerUpload()
        const ext = file.name.split('.').pop() ?? 'bin'
        const storagePath = `${orgId}/${commessa.id}/doc_${Date.now()}.${ext}`
        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from('commesse-docs')
          .upload(storagePath, file)
        if (uploadError) throw uploadError
        await addDocumentoCommessa(commessa.id, file.name, storagePath, 'documento')
        toast.success(`"${file.name}" caricato`)
        router.refresh()
      } catch {
        toast.error(`Errore nel caricamento di "${file.name}"`)
      } finally {
        setUploading(false)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteDoc = async (doc: DocumentoCommessa) => {
    if (!confirm(`Eliminare "${doc.nome_file}"?`)) return
    setDeletingDocId(doc.id)
    try {
      await deleteDocumentoCommessa(doc.id, doc.storage_path)
      toast.success('File eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeletingDocId(null)
    }
  }

  const handleShare = async (doc: DocumentoCommessa) => {
    const url = urlMap[doc.id]
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.nome_file, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copiato negli appunti (valido 1 ora)')
      }
    } catch { /* annullato */ }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b shrink-0">
          {/* Riga cliente — pr-14 per non sovrapporsi al tasto X del Dialog */}
          <div className="pr-14">
            {editMode ? (
              <Input
                value={form.cliente_nome}
                onChange={(e) => setForm((f) => f ? { ...f, cliente_nome: e.target.value } : f)}
                className="text-xl font-bold border-0 shadow-none px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Nome cliente"
              />
            ) : (
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{commessa.cliente_nome}</h2>
            )}
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
              {commessa.numero_commessa && (
                <span className="font-mono text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                  {commessa.numero_commessa}
                </span>
              )}
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${statoInfo.color}`}>
                {statoInfo.label}
              </span>
              <span className="text-xs text-gray-400">{formatMese(commessa.data_conferma)}</span>
              {commessa.operatore_nome && (
                <span className="text-xs text-gray-400">· {commessa.operatore_nome}</span>
              )}
            </div>
          </div>

          {/* Barra azioni — vicino alla linea separatrice */}
          <div className="flex items-center gap-2 mt-3">
            {editMode ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-1" />
                  Annulla
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Check className="h-4 w-4 mr-1" />
                  {saving ? 'Salvataggio...' : 'Salva'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Modifica
                </Button>
                <Button variant="outline" size="sm" onClick={handleClickStampa}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Stampa
                </Button>
                <Button variant="outline" size="sm" onClick={handleCondividi}>
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />
                  Condividi
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Dialog selezione documenti per stampa ── */}
        <Dialog open={stampaDialogOpen} onOpenChange={setStampaDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Stampa scheda commessa</DialogTitle>
            </DialogHeader>
            {commessa.documenti.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Seleziona i documenti da allegare alla stampa:</p>
                <div className="space-y-2">
                  {commessa.documenti.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-teal-600"
                        checked={stampaDocSelezioni.includes(doc.id)}
                        onChange={(e) => {
                          if (e.target.checked) setStampaDocSelezioni((s) => [...s, doc.id])
                          else setStampaDocSelezioni((s) => s.filter((id) => id !== doc.id))
                        }}
                        disabled={!urlMap[doc.id]}
                      />
                      <FileText className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="truncate text-gray-700">{doc.nome_file}</span>
                      {!urlMap[doc.id] && (
                        <span className="text-[10px] text-gray-400">(caricamento…)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nessun documento allegato. La stampa includerà solo la scheda.</p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStampaDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const docsParam = stampaDocSelezioni.join(',')
                  const url = `/commesse/${commessa.id}/stampa${docsParam ? `?docs=${docsParam}` : ''}`
                  // Crea l'anchor fuori dal Dialog per evitare che Radix intercetti l'evento
                  const a = document.createElement('a')
                  a.href = url
                  a.target = '_blank'
                  a.rel = 'noopener noreferrer'
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  setStampaDialogOpen(false)
                }}
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Stampa
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* Note / Descrizione lavori */}
            <section className="space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Descrizione lavori
              </p>
              {editMode ? (
                <textarea
                  value={form.note ?? ''}
                  onChange={setFieldF('note')}
                  placeholder="Note e descrizione dei lavori..."
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              ) : (
                <p className={`text-sm leading-relaxed ${commessa.note ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                  {commessa.note || 'Nessuna descrizione'}
                </p>
              )}
            </section>

            {/* Preventivo + Documenti (2 colonne) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

              {/* Preventivo */}
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Preventivo
                </p>
                {commessa.preventivo_id ? (
                  <Link
                    href={`/preventivi/${commessa.preventivo_id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:underline"
                  >
                    {commessa.numero_preventivo || 'Apri preventivo'}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : editMode ? (
                  <Input
                    value={form.numero_preventivo ?? ''}
                    onChange={(e) => setForm((f) => f ? { ...f, numero_preventivo: e.target.value || null } : f)}
                    placeholder="N. preventivo (es. 2026/042)"
                  />
                ) : (
                  <span className={`text-sm ${commessa.numero_preventivo ? 'text-gray-700 font-mono' : 'text-gray-400 italic'}`}>
                    {commessa.numero_preventivo || 'Non specificato'}
                  </span>
                )}
              </section>

              {/* Documenti allegati */}
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  Documenti allegati
                  {commessa.documenti.length > 0 && (
                    <span className="bg-gray-200 text-gray-600 rounded-full text-[10px] px-1.5 leading-4">
                      {commessa.documenti.length}
                    </span>
                  )}
                </p>
                <div className="space-y-1.5">
                  {commessa.documenti.map((doc) => {
                    const url = urlMap[doc.id]
                    return (
                      <div key={doc.id} className="flex items-center gap-1.5 rounded border px-2.5 py-2 bg-gray-50 text-xs">
                        <FileText className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <span className="flex-1 truncate font-medium text-gray-700">{doc.nome_file}</span>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-0.5 text-gray-400 hover:text-blue-600"
                            title="Visualizza"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        <button
                          onClick={() => handleShare(doc)}
                          disabled={!url}
                          className="p-0.5 text-gray-400 hover:text-teal-600 disabled:opacity-30"
                          title="Condividi / copia link"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          disabled={deletingDocId === doc.id}
                          className="p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-30"
                          title="Elimina"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded px-2.5 py-2 w-full hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                    {uploading ? 'Caricamento...' : 'Carica documento / fattura'}
                  </button>
                </div>
              </section>
            </div>

            {/* Importi */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Importi</p>
              {editMode ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Imponibile (€)</Label>
                      <Input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={form.imponibile || ''}
                        onChange={setNumber('imponibile')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">IVA (€)</Label>
                      <Input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={form.iva_totale || ''}
                        onChange={setNumber('iva_totale')}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    Totale: <span className="font-semibold text-gray-800">{formatEuro(form.imponibile + form.iva_totale)}</span>
                  </p>
                </div>
              ) : (
                <div className="flex items-end gap-6 flex-wrap">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{formatEuro(commessa.totale)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Totale</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-600">{formatEuro(commessa.imponibile)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Imponibile</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-600">{formatEuro(commessa.iva_totale)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">IVA</p>
                  </div>
                </div>
              )}
            </section>

            {/* Costi preventivo manuale (per statistiche) */}
            {haPrevManuale && (editMode || haCostiManualiSalvati) && (
              <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
                  Costi preventivo manuale (per statistiche)
                </p>
                {editMode ? (
                  <>
                    <p className="text-xs text-amber-600/80 -mt-1">
                      Opzionali, al netto dell&apos;IVA (imponibile). Se compilati, confluiscono nel grafico costi/utili.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-normal text-gray-600">Materiale (€)</Label>
                        <Input
                          type="number" step="0.01" min="0" placeholder="0,00"
                          value={form.costo_materiali_manuale ?? ''}
                          onChange={setManuale('costo_materiali_manuale')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-normal text-gray-600">M. opera (€)</Label>
                        <Input
                          type="number" step="0.01" min="0" placeholder="0,00"
                          value={form.costo_manodopera_manuale ?? ''}
                          onChange={setManuale('costo_manodopera_manuale')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-normal text-gray-600">Utile (€)</Label>
                        <Input
                          type="number" step="0.01" placeholder="0,00"
                          value={form.utile_manuale ?? ''}
                          onChange={setManuale('utile_manuale')}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-6 flex-wrap text-sm">
                    <span className="text-gray-500">Materiale: <strong className="text-gray-800">{formatEuro(commessa.costo_materiali_manuale ?? 0)}</strong></span>
                    <span className="text-gray-500">M. opera: <strong className="text-gray-800">{formatEuro(commessa.costo_manodopera_manuale ?? 0)}</strong></span>
                    <span className="text-gray-500">Utile: <strong className="text-green-700">{formatEuro(commessa.utile_manuale ?? 0)}</strong></span>
                  </div>
                )}
              </section>
            )}

            {/* Acconti / Pagamenti */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Pagamenti ricevuti
              </p>

              {commessa.acconti.length > 0 ? (
                <div className="space-y-1.5">
                  {commessa.acconti.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5 bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{formatEuro(a.importo)}</span>
                          <span className="text-xs text-gray-500">{formatData(a.data_pagamento)}</span>
                          <span className="text-xs bg-white border rounded px-1.5 py-0.5 text-gray-600">
                            {METODI.find((m) => m.value === a.metodo_pagamento)?.label ?? a.metodo_pagamento}
                          </span>
                          {a.note && (
                            <span className="text-xs text-gray-400 truncate max-w-[120px]">{a.note}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-teal-600 shrink-0"
                        title="Ricevuta pagamento"
                        onClick={() => {
                          const url = `/commesse/${commessa.id}/ricevuta/${a.id}`
                          const anchor = document.createElement('a')
                          anchor.href = url
                          anchor.target = '_blank'
                          anchor.rel = 'noopener noreferrer'
                          document.body.appendChild(anchor)
                          anchor.click()
                          document.body.removeChild(anchor)
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600 shrink-0"
                        disabled={deletingAccontoId === a.id}
                        onClick={() => handleDeleteAcconto(a.id)}
                        title="Elimina acconto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-right text-gray-500 font-medium pr-1">
                    Totale ricevuto:{' '}
                    <span className="text-gray-800 font-semibold">{formatEuro(commessa.totale_acconti)}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Nessun acconto registrato</p>
              )}

              {/* Form aggiungi acconto */}
              {showAddAcconto ? (
                <form onSubmit={handleAddAcconto} className="border rounded-lg p-3 space-y-2.5 bg-blue-50 border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Importo (€) *</Label>
                      <Input
                        type="number" step="0.01" min="0.01" placeholder="0,00"
                        value={newAcconto.importo || ''}
                        onChange={(e) => setNewAcconto((f) => ({ ...f, importo: parseFloat(e.target.value) || 0 }))}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data</Label>
                      <Input
                        type="date"
                        value={newAcconto.data_pagamento}
                        onChange={(e) => setNewAcconto((f) => ({ ...f, data_pagamento: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Metodo</Label>
                      <Select
                        value={newAcconto.metodo_pagamento}
                        onValueChange={(v) => setNewAcconto((f) => ({ ...f, metodo_pagamento: v as MetodoPagamento }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METODI.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Note</Label>
                      <Input
                        placeholder="Riferimento..."
                        value={newAcconto.note ?? ''}
                        onChange={(e) => setNewAcconto((f) => ({ ...f, note: e.target.value || null }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddAcconto(false)}>
                      Annulla
                    </Button>
                    <Button type="submit" size="sm" disabled={addingAcconto}>
                      {addingAcconto ? 'Registrazione...' : 'Registra acconto'}
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddAcconto(true)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-2 w-full hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Aggiungi acconto
                </button>
              )}
            </section>

            {/* Saldo */}
            <section className="rounded-lg border p-4 flex items-center justify-between bg-white">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Saldo rimanente
                </p>
                <p className={`text-2xl font-bold ${saldoZero ? 'text-green-600' : saldoPositivo ? 'text-orange-600' : 'text-blue-600'}`}>
                  {formatEuro(commessa.saldo)}
                </p>
              </div>
              <div className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                saldoZero
                  ? 'bg-green-100 text-green-700'
                  : saldoPositivo
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {saldoZero ? 'Pagato ✓' : saldoPositivo ? 'Da pagare' : 'Sovrapagato'}
              </div>
            </section>

            {/* Dati aggiuntivi (solo in edit mode) */}
            {editMode && (
              <section className="border rounded-lg p-4 space-y-3 bg-gray-50">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Dati aggiuntivi
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">N. Commessa</Label>
                    <Input
                      value={form.numero_commessa}
                      onChange={(e) => setForm((f) => f ? { ...f, numero_commessa: e.target.value } : f)}
                      placeholder="C-2026-001"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data conferma</Label>
                    <Input type="date" value={form.data_conferma} onChange={setFieldF('data_conferma')} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Operatore</Label>
                  <Select value={form.operatore_id ?? '__nessuno__'} onValueChange={setOperatore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona operatore..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nessuno__">— Nessuno —</SelectItem>
                      {utenti.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reparto</Label>
                  <div className="flex flex-wrap gap-2">
                    {REPARTI.map((r) => {
                      const checked = form.reparti.includes(r.value)
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => toggleReparto(r.value)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            checked
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-gray-300 text-gray-600 hover:border-teal-400'
                          }`}
                        >
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Padding fondo per non avere il saldo incollato al bordo su mobile */}
            <div className="h-2" />

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
