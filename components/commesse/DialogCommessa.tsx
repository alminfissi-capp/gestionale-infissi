'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronsUpDown, X, UserPlus, Building2, User, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'
import { createCommessa, updateCommessa, addDocumentoCommessa, getOrgIdPerUpload } from '@/actions/commesse'
import { createCliente } from '@/actions/clienti'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, CommessaInput, PreventivoPerCommessa, Reparto, UtentePerCommessa } from '@/types/commessa'
import { REPARTI } from '@/types/commessa'
import type { Cliente } from '@/types/cliente'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { db } from '@/lib/db'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa?: CommessaCompleta | null
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  clienti: Cliente[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const today = () => new Date().toISOString().split('T')[0]

const emptyForm = (): CommessaInput => ({
  numero_commessa: '',
  preventivo_id: null,
  numero_preventivo: null,
  cliente_nome: '',
  imponibile: 0,
  iva_totale: 0,
  totale: 0,
  data_conferma: today(),
  operatore_id: null,
  operatore_nome: null,
  note: null,
  reparti: [],
})

function nomeCliente(c: Cliente): string {
  if (c.tipo === 'azienda') return c.ragione_sociale || c.email || '—'
  return [c.nome, c.cognome].filter(Boolean).join(' ') || c.email || '—'
}

export default function DialogCommessa({
  open,
  onOpenChange,
  commessa,
  preventivi,
  utenti,
  clienti,
  preventivoDaConvertire,
}: Props) {
  const router = useRouter()
  const { isOnline } = useOnlineStatus()
  const [form, setForm] = useState<CommessaInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  // Selezione cliente da anagrafica
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [comboOpen, setComboOpen] = useState(false)
  // Nuovo cliente da salvare in anagrafica
  const [salvaCliente, setSalvaCliente] = useState(false)
  const [nuovoTipo, setNuovoTipo] = useState<'privato' | 'azienda'>('privato')
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoCognome, setNuovoCognome] = useState('')
  const [nuovoRS, setNuovoRS] = useState('')

  // File PDF preventivo (solo in creazione, senza preventivo collegato)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filePDF, setFilePDF] = useState<File | null>(null)

  // Reset all'apertura
  useEffect(() => {
    if (!open) return
    setClienteId(null)
    setSalvaCliente(false)
    setNuovoTipo('privato')
    setNuovoNome('')
    setNuovoCognome('')
    setNuovoRS('')
    setFilePDF(null)
    if (commessa) {
      setForm({
        numero_commessa: commessa.numero_commessa,
        preventivo_id: commessa.preventivo_id,
        numero_preventivo: commessa.numero_preventivo,
        cliente_nome: commessa.cliente_nome,
        imponibile: commessa.imponibile,
        iva_totale: commessa.iva_totale,
        totale: commessa.totale,
        data_conferma: commessa.data_conferma,
        operatore_id: commessa.operatore_id,
        operatore_nome: commessa.operatore_nome,
        note: commessa.note,
        reparti: commessa.reparti ?? [],
      })
    } else if (preventivoDaConvertire) {
      const imp = round2(preventivoDaConvertire.imponibile)
      const iva = round2(preventivoDaConvertire.iva_totale)
      setForm({
        ...emptyForm(),
        preventivo_id: preventivoDaConvertire.id,
        numero_preventivo: preventivoDaConvertire.numero,
        cliente_nome: preventivoDaConvertire.cliente_nome,
        imponibile: imp,
        iva_totale: iva,
        totale: round2(imp + iva),
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, commessa, preventivoDaConvertire])

  // Sincronizza cliente_nome quando si compila il form nuovo cliente
  useEffect(() => {
    if (!salvaCliente) return
    const nome =
      nuovoTipo === 'privato'
        ? [nuovoNome, nuovoCognome].filter(Boolean).join(' ')
        : nuovoRS
    setForm((f) => ({ ...f, cliente_nome: nome }))
  }, [salvaCliente, nuovoTipo, nuovoNome, nuovoCognome, nuovoRS])

  const handleSelectCliente = (c: Cliente) => {
    setClienteId(c.id)
    setForm((f) => ({ ...f, cliente_nome: nomeCliente(c) }))
    setSalvaCliente(false)
    setNuovoNome('')
    setNuovoCognome('')
    setNuovoRS('')
    setComboOpen(false)
  }

  const handleDeselectCliente = () => setClienteId(null)

  const setPreventivoSelezionato = (pid: string) => {
    if (pid === '__nessuno__') {
      setForm((f) => ({ ...f, preventivo_id: null, numero_preventivo: null }))
      setFilePDF(null)
      return
    }
    const prev = preventivi.find((p) => p.id === pid)
    if (!prev) return
    const imp = round2(prev.imponibile)
    const iva = round2(prev.iva_totale)
    setForm((f) => ({
      ...f,
      preventivo_id: prev.id,
      numero_preventivo: prev.numero,
      cliente_nome: prev.cliente_nome,
      imponibile: imp,
      iva_totale: iva,
      totale: round2(imp + iva),
    }))
    setClienteId(null)
    setSalvaCliente(false)
    setFilePDF(null)
  }

  const setOperatore = (uid: string) => {
    if (uid === '__nessuno__') {
      setForm((f) => ({ ...f, operatore_id: null, operatore_nome: null }))
      return
    }
    const u = utenti.find((u) => u.id === uid)
    setForm((f) => ({ ...f, operatore_id: uid, operatore_nome: u?.nome ?? null }))
  }

  const setField = (k: keyof CommessaInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value || null }))
  }

  const toggleReparto = (r: Reparto) => {
    setForm((f) => ({
      ...f,
      reparti: f.reparti.includes(r) ? f.reparti.filter((x) => x !== r) : [...f.reparti, r],
    }))
  }

  const setNumber = (k: 'imponibile' | 'iva_totale') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value) || 0
    setForm((f) => {
      const next = { ...f, [k]: v }
      next.totale = next.imponibile + next.iva_totale
      return next
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > 20 * 1024 * 1024) {
      toast.error('File troppo grande (max 20 MB)')
      return
    }
    setFilePDF(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const nomeDaSalvare = salvaCliente
      ? (nuovoTipo === 'privato'
          ? [nuovoNome, nuovoCognome].filter(Boolean).join(' ')
          : nuovoRS)
      : form.cliente_nome

    if (!nomeDaSalvare.trim()) {
      toast.error('Il nome cliente è obbligatorio')
      return
    }
    if (salvaCliente && !clienteId) {
      const hasName = nuovoTipo === 'privato'
        ? nuovoNome.trim() || nuovoCognome.trim()
        : nuovoRS.trim()
      if (!hasName) {
        toast.error(nuovoTipo === 'privato' ? 'Inserisci almeno nome o cognome' : 'Inserisci la ragione sociale')
        return
      }
    }

    setLoading(true)
    try {
      if (salvaCliente && !clienteId && !commessa) {
        await createCliente({
          tipo: nuovoTipo,
          nome: nuovoTipo === 'privato' ? nuovoNome.trim() || null : null,
          cognome: nuovoTipo === 'privato' ? nuovoCognome.trim() || null : null,
          ragione_sociale: nuovoTipo === 'azienda' ? nuovoRS.trim() || null : null,
        })
      }

      const formFinale = { ...form, cliente_nome: nomeDaSalvare }

      if (commessa) {
        if (!isOnline) {
          toast.error('Connessione assente. La modifica non è disponibile offline.')
          return
        }
        await updateCommessa(commessa.id, formFinale)
        toast.success('Commessa aggiornata')
        onOpenChange(false)
        router.refresh()
      } else if (!isOnline) {
        await db.pendingCommesse.add({ input: formFinale, createdAt: new Date().toISOString() })
        toast.success('Commessa salvata offline. Verrà sincronizzata al ritorno in rete.')
        onOpenChange(false)
      } else {
        const { id: newId } = await createCommessa(formFinale)

        // Upload PDF preventivo se fornito
        if (filePDF) {
          try {
            const orgId = await getOrgIdPerUpload()
            const ext = filePDF.name.split('.').pop() ?? 'bin'
            const storagePath = `${orgId}/${newId}/prev_${Date.now()}.${ext}`
            const supabase = createClient()
            const { error: uploadError } = await supabase.storage
              .from('commesse-docs')
              .upload(storagePath, filePDF)
            if (uploadError) throw uploadError
            await addDocumentoCommessa(newId, filePDF.name, storagePath, 'preventivo')
          } catch {
            toast.error('Commessa creata, ma errore nel caricamento del PDF')
          }
        }

        toast.success('Commessa creata')
        onOpenChange(false)
        router.refresh()
      }
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const totale = form.imponibile + form.iva_totale
  const clienteSelezionato = clienteId ? clienti.find((c) => c.id === clienteId) : null
  const isCreazione = !commessa

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{commessa ? 'Modifica commessa' : 'Nuova commessa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Preventivo ── */}
          <div className="space-y-2">
            <Label>Preventivo dal sistema (opzionale)</Label>
            <Select
              value={form.preventivo_id ?? '__nessuno__'}
              onValueChange={setPreventivoSelezionato}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona preventivo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nessuno__">— Nessuno —</SelectItem>
                {preventivi.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.numero ? `${p.numero} — ` : ''}{p.cliente_nome || 'Cliente senza nome'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* N. preventivo manuale + upload PDF — visibili solo senza preventivo collegato */}
            {!form.preventivo_id && (
              <div className="space-y-2 pt-1">
                <Input
                  value={form.numero_preventivo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, numero_preventivo: e.target.value || null }))}
                  placeholder="N. preventivo manuale (es. 2026/042)"
                />

                {/* Upload PDF — solo in creazione */}
                {isCreazione && (
                  <div className="space-y-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {filePDF ? (
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-gray-50 text-sm">
                        <FileText className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="flex-1 truncate text-gray-700">{filePDF.name}</span>
                        <button
                          type="button"
                          onClick={() => { setFilePDF(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-2 w-full hover:border-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Upload className="h-4 w-4 shrink-0" />
                        Allega PDF preventivo (opzionale)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Cliente ── */}
          <div className="space-y-2">
            <Label>Cliente *</Label>

            <div className="flex gap-2">
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="flex-1 justify-between font-normal text-left"
                  >
                    <span className="truncate">
                      {clienteSelezionato ? nomeCliente(clienteSelezionato) : 'Cerca in anagrafica...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca cliente..." />
                    <CommandList>
                      <CommandEmpty className="py-3 text-center text-sm text-gray-500">
                        Nessun cliente trovato
                      </CommandEmpty>
                      <CommandGroup>
                        {clienti.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={nomeCliente(c)}
                            onSelect={() => handleSelectCliente(c)}
                          >
                            {nomeCliente(c)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {clienteId && (
                <Button type="button" variant="ghost" size="icon" onClick={handleDeselectCliente}>
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              )}
            </div>

            {!clienteId && (
              <>
                {!salvaCliente && (
                  <Input
                    value={form.cliente_nome}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_nome: e.target.value }))}
                    placeholder="Oppure scrivi il nome del cliente"
                  />
                )}

                {!commessa && (
                  <button
                    type="button"
                    onClick={() => setSalvaCliente((v) => !v)}
                    className={`flex items-center gap-2 text-sm font-medium rounded-md border px-3 py-1.5 transition-colors w-full justify-center ${
                      salvaCliente
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <UserPlus className="h-4 w-4" />
                    {salvaCliente ? 'Annulla — non salvare in anagrafica' : 'Salva come nuovo cliente in anagrafica'}
                  </button>
                )}

                {salvaCliente && (
                  <div className="rounded-lg border p-3 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-2 gap-2">
                      {(['privato', 'azienda'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNuovoTipo(t)}
                          className={`flex items-center justify-center gap-1.5 py-2 rounded-md border text-sm font-medium transition-colors ${
                            nuovoTipo === t
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {t === 'privato' ? <User className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                          {t === 'privato' ? 'Privato' : 'Azienda'}
                        </button>
                      ))}
                    </div>
                    {nuovoTipo === 'privato' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Nome" value={nuovoNome} onChange={(e) => setNuovoNome(e.target.value)} autoFocus />
                        <Input placeholder="Cognome" value={nuovoCognome} onChange={(e) => setNuovoCognome(e.target.value)} />
                      </div>
                    ) : (
                      <Input placeholder="Ragione sociale" value={nuovoRS} onChange={(e) => setNuovoRS(e.target.value)} autoFocus />
                    )}
                    {form.cliente_nome && (
                      <p className="text-xs text-teal-600">
                        Verrà salvato come: <strong>{form.cliente_nome}</strong>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {clienteId && (
              <p className="text-xs text-blue-600">Cliente selezionato dall&apos;anagrafica</p>
            )}
          </div>

          {/* ── Importi ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="imponibile">Imponibile (€)</Label>
              <Input
                id="imponibile"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.imponibile || ''}
                onChange={setNumber('imponibile')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iva_totale">IVA (€)</Label>
              <Input
                id="iva_totale"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.iva_totale || ''}
                onChange={setNumber('iva_totale')}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 -mt-2">
            Totale: <span className="font-semibold text-gray-800">{formatEuro(totale)}</span>
          </p>

          {/* ── N. commessa e data ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="numero_commessa">N. Commessa</Label>
              <Input
                id="numero_commessa"
                value={form.numero_commessa}
                onChange={(e) => setForm((f) => ({ ...f, numero_commessa: e.target.value }))}
                placeholder="es. C-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_conferma">Data conferma</Label>
              <Input
                id="data_conferma"
                type="date"
                value={form.data_conferma}
                onChange={setField('data_conferma')}
              />
            </div>
          </div>

          {/* ── Operatore ── */}
          <div className="space-y-2">
            <Label>Operatore</Label>
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

          {/* ── Reparti ── */}
          <div className="space-y-2">
            <Label>Reparto</Label>
            <div className="flex flex-wrap gap-2">
              {REPARTI.map((r) => {
                const checked = form.reparti.includes(r.value)
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleReparto(r.value)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      checked
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:border-teal-400 hover:text-teal-600'
                    }`}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Note ── */}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <textarea
              id="note"
              value={form.note ?? ''}
              onChange={setField('note')}
              placeholder="Note interne..."
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? 'Salvataggio...'
                : commessa
                ? 'Salva'
                : salvaCliente
                ? 'Salva cliente e crea commessa'
                : 'Crea commessa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
