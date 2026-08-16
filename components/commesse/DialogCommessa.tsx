'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronsUpDown, X, UserPlus, Building2, User,
  Upload, FileText, Link2, FilePlus2,
} from 'lucide-react'
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
import {
  createCommessa,
  updateCommessa,
  setPreventiviCommessa,
  getOrgIdPerUpload,
} from '@/actions/commesse'
import { createCliente } from '@/actions/clienti'
import { filtraClienti } from '@/lib/ricerca-clienti'
import { formatEuro } from '@/lib/pricing'
import type {
  CommessaCompleta,
  CommessaInput,
  GruppoCommesse,
  PreventivoPerCommessa,
  PreventivoCommessa,
  Reparto,
  UtentePerCommessa,
} from '@/types/commessa'
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
  gruppoId: string
  gruppi: GruppoCommesse[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const today = () => new Date().toISOString().split('T')[0]
let _nextTempId = 0
const nextTempId = () => `tmp-${_nextTempId++}`

// ── Tipo stato locale per ogni preventivo in lista ──────────────
type PrevItem = {
  tempId: string
  tipo: 'sistema' | 'manuale'
  preventivo_id: string | null
  numero: string
  cliente_nome?: string
  file: File | null          // nuovo file da caricare
  dbId?: string              // id DB (se già salvato)
  storage_path?: string | null
  nome_file?: string | null
}

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
  costo_materiali_manuale: null,
  costo_manodopera_manuale: null,
  utile_manuale: null,
})

function nomeCliente(c: Cliente): string {
  if (c.tipo === 'azienda') return c.ragione_sociale || c.email || '—'
  return [c.nome, c.cognome].filter(Boolean).join(' ') || c.email || '—'
}

function pcToItem(pc: PreventivoCommessa, preventivi: PreventivoPerCommessa[]): PrevItem {
  return {
    tempId: pc.id,
    tipo: pc.preventivo_id ? 'sistema' : 'manuale',
    preventivo_id: pc.preventivo_id,
    numero: pc.numero_preventivo ?? '',
    cliente_nome: pc.preventivo_id
      ? preventivi.find((p) => p.id === pc.preventivo_id)?.cliente_nome
      : undefined,
    file: null,
    dbId: pc.id,
    storage_path: pc.storage_path,
    nome_file: pc.nome_file,
  }
}

// ── Componente principale ────────────────────────────────────────

export default function DialogCommessa({
  open,
  onOpenChange,
  commessa,
  preventivi,
  utenti,
  clienti,
  preventivoDaConvertire,
  gruppoId,
  gruppi,
}: Props) {
  const router = useRouter()
  const { isOnline } = useOnlineStatus()
  const [form, setForm] = useState<CommessaInput>(emptyForm())
  const [loading, setLoading] = useState(false)

  // Blocco di destinazione (solo creazione) — default: blocco corrente
  const [gruppoSel, setGruppoSel] = useState<string>(gruppoId)

  // Lista preventivi collegati
  const [prevItems, setPrevItems] = useState<PrevItem[]>([])
  const [sistemaOpen, setSistemaOpen] = useState(false)

  // Selezione cliente da anagrafica
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [comboOpen, setComboOpen] = useState(false)
  const [ricercaCliente, setRicercaCliente] = useState('')
  const [salvaCliente, setSalvaCliente] = useState(false)
  const [nuovoTipo, setNuovoTipo] = useState<'privato' | 'azienda'>('privato')
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoCognome, setNuovoCognome] = useState('')
  const [nuovoRS, setNuovoRS] = useState('')

  // File input refs per i preventivi manuali
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({})

  // Reset all'apertura
  useEffect(() => {
    if (!open) return
    setGruppoSel(gruppoId)
    setClienteId(null)
    setSalvaCliente(false)
    setNuovoTipo('privato')
    setNuovoNome('')
    setNuovoCognome('')
    setNuovoRS('')
    setSistemaOpen(false)

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
        costo_materiali_manuale: commessa.costo_materiali_manuale,
        costo_manodopera_manuale: commessa.costo_manodopera_manuale,
        utile_manuale: commessa.utile_manuale,
      })
      setPrevItems((commessa.preventivi_collegati ?? []).map((pc) => pcToItem(pc, preventivi)))
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
      setPrevItems([{
        tempId: nextTempId(),
        tipo: 'sistema',
        preventivo_id: preventivoDaConvertire.id,
        numero: preventivoDaConvertire.numero ?? '',
        cliente_nome: preventivoDaConvertire.cliente_nome,
        file: null,
      }])
    } else {
      setForm(emptyForm())
      setPrevItems([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  // ── Gestione lista preventivi ──────────────────────────────────

  const addSistema = (pid: string) => {
    if (prevItems.find((p) => p.preventivo_id === pid)) return
    const prev = preventivi.find((p) => p.id === pid)
    if (!prev) return
    setPrevItems((items) => [...items, {
      tempId: nextTempId(),
      tipo: 'sistema',
      preventivo_id: pid,
      numero: prev.numero ?? '',
      cliente_nome: prev.cliente_nome,
      file: null,
    }])
    setSistemaOpen(false)
  }

  const addManuale = () => {
    setPrevItems((items) => [...items, {
      tempId: nextTempId(),
      tipo: 'manuale',
      preventivo_id: null,
      numero: '',
      file: null,
    }])
  }

  const removeItem = (tempId: string) => {
    setPrevItems((items) => items.filter((i) => i.tempId !== tempId))
  }

  const updateNumero = (tempId: string, numero: string) => {
    setPrevItems((items) =>
      items.map((i) => i.tempId === tempId ? { ...i, numero } : i)
    )
  }

  const updateFile = (tempId: string, file: File | null) => {
    setPrevItems((items) =>
      items.map((i) => i.tempId === tempId ? { ...i, file, nome_file: file?.name ?? i.nome_file } : i)
    )
  }

  const setFileInputRef = useCallback((tempId: string) => (el: HTMLInputElement | null) => {
    fileInputsRef.current[tempId] = el
  }, [])

  // IDs già selezionati come sistema (per escluderli dal combobox)
  const selectedPrevIds = new Set(prevItems.filter((i) => i.tipo === 'sistema').map((i) => i.preventivo_id))

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

  // Campi costi manuali (vuoto → null, così "non compilato" resta distinguibile)
  const setManuale = (k: 'costo_materiali_manuale' | 'costo_manodopera_manuale' | 'utile_manuale') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setForm((f) => ({ ...f, [k]: raw === '' ? null : (parseFloat(raw) || 0) }))
    }

  const haPreventivoManuale = prevItems.some((i) => i.tipo === 'manuale')

  // ── Submit ──────────────────────────────────────────────────────

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

    // Deriva preventivo_id / numero_preventivo dal primo elemento (backward compat)
    const firstItem = prevItems[0]
    const derivedPreventivoId = firstItem?.preventivo_id ?? null
    const derivedNumeroPreventivo = firstItem?.numero || null

    const formFinale: CommessaInput = {
      ...form,
      cliente_nome: nomeDaSalvare,
      preventivo_id: derivedPreventivoId,
      numero_preventivo: derivedNumeroPreventivo,
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

      if (commessa) {
        if (!isOnline) {
          toast.error('Connessione assente. La modifica non è disponibile offline.')
          return
        }
        await updateCommessa(commessa.id, formFinale)
        await uploadAndSavePreventivi(commessa.id)
        toast.success('Commessa aggiornata')
        onOpenChange(false)
        router.refresh()
      } else if (!isOnline) {
        await db.pendingCommesse.add({ input: { ...formFinale, gruppo_id: gruppoSel }, createdAt: new Date().toISOString() })
        toast.success('Commessa salvata offline. Verrà sincronizzata al ritorno in rete.')
        onOpenChange(false)
      } else {
        const { id: newId } = await createCommessa({ ...formFinale, gruppo_id: gruppoSel })
        await uploadAndSavePreventivi(newId)
        toast.success('Commessa creata')
        onOpenChange(false)
        if (gruppoSel !== gruppoId) {
          router.push(`/commesse/${gruppoSel}`)
        } else {
          router.refresh()
        }
      }
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const uploadAndSavePreventivi = async (commessaId: string) => {
    const supabase = createClient()
    const items = await Promise.all(
      prevItems.map(async (item, i) => {
        let storagePath = item.storage_path ?? null
        let nomeFile = item.nome_file ?? null

        if (item.file) {
          try {
            const orgId = await getOrgIdPerUpload()
            const ext = item.file.name.split('.').pop() ?? 'bin'
            storagePath = `${orgId}/${commessaId}/prev_${i}_${Date.now()}.${ext}`
            const { error } = await supabase.storage
              .from('commesse-docs')
              .upload(storagePath, item.file)
            if (error) throw error
            nomeFile = item.file.name
          } catch {
            toast.error(`Errore upload "${item.file.name}"`)
            storagePath = null
            nomeFile = null
          }
        }

        return {
          preventivo_id: item.preventivo_id,
          numero_preventivo: item.numero || null,
          storage_path: storagePath,
          nome_file: nomeFile,
          ordine: i,
        }
      })
    )
    await setPreventiviCommessa(commessaId, items)
  }

  const totale = form.imponibile + form.iva_totale
  const clienteSelezionato = clienteId ? clienti.find((c) => c.id === clienteId) : null
  const clientiFiltrati = useMemo(() => filtraClienti(clienti, ricercaCliente), [clienti, ricercaCliente])
  const isCreazione = !commessa

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg xl:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{commessa ? 'Modifica commessa' : 'Nuova commessa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Blocco di destinazione (solo creazione) ── */}
          {isCreazione && (
            <div className="space-y-2">
              <Label>Blocco di destinazione *</Label>
              <Select value={gruppoSel} onValueChange={setGruppoSel}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona blocco..." />
                </SelectTrigger>
                <SelectContent>
                  {/* Solo blocchi commesse: scadenze e "Da programmare" ospitano
                      scadenze da pagare. Lista in positivo, così un tipo futuro
                      resta escluso di default. */}
                  {gruppi.filter((g) => g.tipo === 'commesse').map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gruppoSel !== gruppoId && (
                <p className="text-xs text-amber-600">
                  La commessa verrà inserita in &quot;{gruppi.find((g) => g.id === gruppoSel)?.nome}&quot;, non nel blocco corrente.
                </p>
              )}
            </div>
          )}

          {/* ── Preventivi collegati ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Preventivi collegati</Label>
              <div className="flex gap-1.5">
                {/* Aggiungi da sistema */}
                <Popover open={sistemaOpen} onOpenChange={setSistemaOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                      <Link2 className="h-3 w-3" />
                      Dal sistema
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-72" align="end">
                    <Command>
                      <CommandInput placeholder="Cerca preventivo..." />
                      <CommandList>
                        <CommandEmpty className="py-3 text-center text-sm text-gray-500">
                          Nessun preventivo trovato
                        </CommandEmpty>
                        <CommandGroup>
                          {preventivi
                            .filter((p) => !selectedPrevIds.has(p.id))
                            .map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.numero} ${p.cliente_nome}`}
                                onSelect={() => addSistema(p.id)}
                              >
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs">{p.numero || '—'}</span>
                                  <span className="text-xs text-gray-500 truncate">{p.cliente_nome}</span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Aggiungi manuale */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={addManuale}
                >
                  <FilePlus2 className="h-3 w-3" />
                  Manuale
                </Button>
              </div>
            </div>

            {/* Lista preventivi */}
            {prevItems.length > 0 ? (
              <div className="space-y-2">
                {prevItems.map((item) => (
                  <div
                    key={item.tempId}
                    className="flex items-center gap-2 rounded-md border bg-gray-50 px-2.5 py-2"
                  >
                    {item.tipo === 'sistema' ? (
                      <>
                        <Link2 className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs font-medium text-teal-700">
                            {item.numero || '—'}
                          </p>
                          {item.cliente_nome && (
                            <p className="text-xs text-gray-400 truncate">{item.cliente_nome}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <Input
                          value={item.numero}
                          onChange={(e) => updateNumero(item.tempId, e.target.value)}
                          placeholder="N. preventivo (es. 2026/042)"
                          className="h-7 text-xs flex-1 font-mono"
                        />
                        {/* Upload PDF */}
                        <input
                          ref={setFileInputRef(item.tempId)}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="hidden"
                          onChange={(e) => updateFile(item.tempId, e.target.files?.[0] ?? null)}
                        />
                        {item.file || item.storage_path ? (
                          <button
                            type="button"
                            title={item.file?.name ?? item.nome_file ?? 'PDF allegato'}
                            className="flex items-center gap-1 text-[10px] bg-red-50 border border-red-200 text-red-600 rounded px-1.5 py-0.5 hover:bg-red-100 max-w-[90px]"
                            onClick={() => fileInputsRef.current[item.tempId]?.click()}
                          >
                            <FileText className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{item.file?.name ?? item.nome_file}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputsRef.current[item.tempId]?.click()}
                            className="flex items-center gap-1 text-xs text-gray-400 border border-dashed border-gray-300 rounded px-1.5 py-0.5 hover:border-teal-400 hover:text-teal-600 whitespace-nowrap"
                          >
                            <Upload className="h-3 w-3" />
                            PDF
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.tempId)}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-1">
                Nessun preventivo collegato — usa i pulsanti sopra per aggiungerne.
              </p>
            )}
          </div>

          {/* ── Costi preventivo manuale (per statistiche) ── */}
          {haPreventivoManuale && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <Label className="text-amber-800">Costi preventivo manuale (per statistiche)</Label>
              <p className="text-xs text-amber-600/80 -mt-1">
                Opzionali, al netto dell&apos;IVA (imponibile). Se compilati, confluiscono nel grafico costi/utili.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cm_materiali" className="text-xs font-normal text-gray-600">Materiale (€)</Label>
                  <Input
                    id="cm_materiali"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={form.costo_materiali_manuale ?? ''}
                    onChange={setManuale('costo_materiali_manuale')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cm_posa" className="text-xs font-normal text-gray-600">M. opera (€)</Label>
                  <Input
                    id="cm_posa"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={form.costo_manodopera_manuale ?? ''}
                    onChange={setManuale('costo_manodopera_manuale')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cm_utile" className="text-xs font-normal text-gray-600">Utile (€)</Label>
                  <Input
                    id="cm_utile"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.utile_manuale ?? ''}
                    onChange={setManuale('utile_manuale')}
                  />
                </div>
              </div>
            </div>
          )}

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
                  {/* shouldFilter={false}: filtriamo noi con la stessa logica dell'anagrafica */}
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Cerca per nome, telefono, email..."
                      value={ricercaCliente}
                      onValueChange={setRicercaCliente}
                    />
                    <CommandList>
                      <CommandEmpty className="py-3 text-center text-sm text-gray-500">
                        Nessun cliente trovato
                      </CommandEmpty>
                      <CommandGroup>
                        {clientiFiltrati.map((c) => (
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
