'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Upload, X } from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'
import { createListinoSuMisura, updateListinoSuMisura, getCurrentOrgId } from '@/actions/listini'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import type { ListinoSuMisuraCompleto, FinituraSuMisura, GruppoAccessoriSuMisura, AccessorioSuMisura } from '@/types/listino'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoriaId: string
  listino?: ListinoSuMisuraCompleto
  onSuccess: () => void
}

// ── Local state types ─────────────────────────────────────────────────────────
type FinituraState = Omit<FinituraSuMisura, 'id' | 'organization_id' | 'listino_id' | 'created_at'>
type AccessorioState = Omit<AccessorioSuMisura, 'id' | 'organization_id' | 'gruppo_id' | 'created_at'>
type GruppoState = {
  _key: string
  nome: string
  tipo_scelta: 'singolo' | 'multiplo' | 'incluso'
  ordine: number
  expanded: boolean
  accessori: AccessorioState[]
}

async function resizeImage(file: File, maxDim = 600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas error'))), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

const UNITA_LABEL: Record<string, string> = { pz: 'Pezzo (pz)', mq: 'Metro quadro (mq)', ml: 'Metro lineare (ml)' }
const TIPO_MAG_LABEL: Record<string, string> = { percentuale: '% sul prezzo mq', mq: '€/mq aggiuntivi', fisso: '€ fissi' }
const SCELTA_LABEL: Record<string, string> = { singolo: 'Scelta singola (radio)', multiplo: 'Scelta multipla (checkbox)', incluso: 'Sempre incluso' }

function emptyFinitura(ordine: number): FinituraState {
  return { nome: '', tipo_maggiorazione: 'percentuale', valore: 0, prezzo_acquisto: 0, ordine }
}

function emptyAccessorio(ordine: number): AccessorioState {
  return { nome: '', unita: 'pz', prezzo: 0, prezzo_acquisto: 0, qty_modificabile: false, qty_default: 1, ordine }
}

function emptyGruppo(ordine: number): GruppoState {
  return { _key: crypto.randomUUID(), nome: '', tipo_scelta: 'multiplo', ordine, expanded: true, accessori: [] }
}

function initGruppi(listino?: ListinoSuMisuraCompleto): GruppoState[] {
  return (listino?.gruppi_accessori ?? []).map((g, gi) => ({
    _key: g.id,
    nome: g.nome,
    tipo_scelta: g.tipo_scelta,
    ordine: gi,
    expanded: false,
    accessori: (g.accessori ?? []).map((a, ai) => ({
      nome: a.nome,
      unita: a.unita,
      prezzo: a.prezzo,
      prezzo_acquisto: a.prezzo_acquisto,
      qty_modificabile: a.qty_modificabile,
      qty_default: a.qty_default,
      ordine: ai,
    })),
  }))
}

export default function DialogListinoSuMisura({ open, onOpenChange, categoriaId, listino, onSuccess }: Props) {
  // Tab Prodotto
  const [nome, setNome] = useState(listino?.nome ?? '')
  const [descrizione, setDescrizione] = useState(listino?.descrizione ?? '')
  const [prezzoMq, setPrezzoMq] = useState(listino?.prezzo_mq ?? 0)
  const [prezzoAcquistoMq, setPrezzoAcquistoMq] = useState(listino?.prezzo_acquisto_mq ?? 0)
  const [larghezzaMin, setLarghezzaMin] = useState(listino?.larghezza_min ?? 0)
  const [larghezzaMax, setLarghezzaMax] = useState(listino?.larghezza_max ?? 9999)
  const [altezzaMin, setAltezzaMin] = useState(listino?.altezza_min ?? 0)
  const [altezzaMax, setAltezzaMax] = useState(listino?.altezza_max ?? 9999)
  const [mqMinimo, setMqMinimo] = useState(listino?.mq_minimo ?? 0)
  const [attivo, setAttivo] = useState(listino?.attivo ?? true)

  // Tab Finiture
  const [finiture, setFiniture] = useState<FinituraState[]>(
    listino?.finiture.map((f, i) => ({ nome: f.nome, tipo_maggiorazione: f.tipo_maggiorazione, valore: f.valore, prezzo_acquisto: f.prezzo_acquisto, ordine: i })) ?? []
  )

  // Tab Accessori (gruppi)
  const [gruppi, setGruppi] = useState<GruppoState[]>(initGruppi(listino))

  const [immagineUrl, setImmagineUrl] = useState<string | null>(listino?.immagine_url ?? null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const blob = await resizeImage(file, 600)
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const fileName = `${orgId}/${crypto.randomUUID()}.webp`
      const { error } = await supabase.storage
        .from('listini-immagini')
        .upload(fileName, blob, { contentType: 'image/webp', upsert: false })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('listini-immagini').getPublicUrl(fileName)
      setImmagineUrl(publicUrl)
    } catch {
      toast.error('Errore nel caricamento immagine')
    } finally {
      setUploadingImg(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Reset quando si apre con un listino diverso
  useEffect(() => {
    if (open) {
      setNome(listino?.nome ?? '')
      setDescrizione(listino?.descrizione ?? '')
      setPrezzoMq(listino?.prezzo_mq ?? 0)
      setPrezzoAcquistoMq(listino?.prezzo_acquisto_mq ?? 0)
      setLarghezzaMin(listino?.larghezza_min ?? 0)
      setLarghezzaMax(listino?.larghezza_max ?? 9999)
      setAltezzaMin(listino?.altezza_min ?? 0)
      setAltezzaMax(listino?.altezza_max ?? 9999)
      setMqMinimo(listino?.mq_minimo ?? 0)
      setImmagineUrl(listino?.immagine_url ?? null)
      setAttivo(listino?.attivo ?? true)
      setFiniture(listino?.finiture.map((f, i) => ({ nome: f.nome, tipo_maggiorazione: f.tipo_maggiorazione, valore: f.valore, prezzo_acquisto: f.prezzo_acquisto, ordine: i })) ?? [])
      setGruppi(initGruppi(listino))
    }
  }, [open, listino])

  // ── Finiture helpers ──────────────────────────────────────────────────────
  const updateFinitura = (i: number, field: keyof FinituraState, value: unknown) => {
    setFiniture((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f))
  }
  const removeFinitura = (i: number) => setFiniture((prev) => prev.filter((_, idx) => idx !== i))

  // ── Gruppi helpers ────────────────────────────────────────────────────────
  const updateGruppo = (gi: number, field: keyof GruppoState, value: unknown) => {
    setGruppi((prev) => prev.map((g, idx) => idx === gi ? { ...g, [field]: value } : g))
  }
  const removeGruppo = (gi: number) => setGruppi((prev) => prev.filter((_, idx) => idx !== gi))
  const toggleGruppo = (gi: number) => updateGruppo(gi, 'expanded', !gruppi[gi].expanded)

  const addAccessorio = (gi: number) => {
    setGruppi((prev) => prev.map((g, idx) =>
      idx !== gi ? g : { ...g, accessori: [...g.accessori, emptyAccessorio(g.accessori.length)] }
    ))
  }
  const updateAccessorio = (gi: number, ai: number, field: keyof AccessorioState, value: unknown) => {
    setGruppi((prev) => prev.map((g, idx) =>
      idx !== gi ? g : {
        ...g,
        accessori: g.accessori.map((a, aidx) => aidx === ai ? { ...a, [field]: value } : a),
      }
    ))
  }
  const removeAccessorio = (gi: number, ai: number) => {
    setGruppi((prev) => prev.map((g, idx) =>
      idx !== gi ? g : { ...g, accessori: g.accessori.filter((_, aidx) => aidx !== ai) }
    ))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!nome.trim()) { toast.error('Inserisci il nome del prodotto'); return }
    if (prezzoMq <= 0) { toast.error('Il prezzo €/mq deve essere maggiore di 0'); return }

    setSaving(true)
    try {
      const input = {
        categoria_id: categoriaId,
        nome: nome.trim(),
        descrizione: descrizione.trim(),
        prezzo_mq: prezzoMq,
        prezzo_acquisto_mq: prezzoAcquistoMq,
        larghezza_min: larghezzaMin,
        larghezza_max: larghezzaMax,
        altezza_min: altezzaMin,
        altezza_max: altezzaMax,
        mq_minimo: mqMinimo,
        immagine_url: immagineUrl,
        attivo,
        finiture: finiture.map((f, i) => ({ ...f, ordine: i })),
        gruppi_accessori: gruppi.map((g, gi) => ({
          nome: g.nome,
          tipo_scelta: g.tipo_scelta,
          accessori: g.accessori.map((a, ai) => ({ ...a, ordine: ai })),
        })),
      }

      if (listino) {
        await updateListinoSuMisura(listino.id, input)
        toast.success('Prodotto aggiornato')
      } else {
        await createListinoSuMisura(input)
        toast.success('Prodotto creato')
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{listino ? 'Modifica prodotto' : 'Nuovo prodotto su misura'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="prodotto" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="prodotto" className="flex-1">Prodotto</TabsTrigger>
            <TabsTrigger value="finiture" className="flex-1">
              Finiture {finiture.length > 0 && <span className="ml-1 text-xs opacity-60">({finiture.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="accessori" className="flex-1">
              Accessori {gruppi.length > 0 && <span className="ml-1 text-xs opacity-60">({gruppi.length})</span>}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-3">

            {/* ── Tab Prodotto ──────────────────────────────────────── */}
            <TabsContent value="prodotto" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Nome prodotto *</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Vetro camera 4/12/4" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Descrizione</Label>
                  <Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Descrizione opzionale" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label>Prezzo vendita €/mq *</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} step={0.01} value={prezzoMq} onChange={(e) => setPrezzoMq(parseFloat(e.target.value) || 0)} className="text-right" />
                    <span className="text-xs text-gray-400 shrink-0">€/mq</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Prezzo acquisto €/mq</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} step={0.01} value={prezzoAcquistoMq} onChange={(e) => setPrezzoAcquistoMq(parseFloat(e.target.value) || 0)} className="text-right" />
                    <span className="text-xs text-gray-400 shrink-0">€/mq</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <p className="col-span-2 text-xs font-medium text-gray-600">Limiti dimensionali (mm)</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Larghezza min</Label>
                  <Input type="number" min={0} value={larghezzaMin} onChange={(e) => setLarghezzaMin(parseInt(e.target.value) || 0)} className="text-right" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Larghezza max</Label>
                  <Input type="number" min={0} value={larghezzaMax} onChange={(e) => setLarghezzaMax(parseInt(e.target.value) || 9999)} className="text-right" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Altezza min</Label>
                  <Input type="number" min={0} value={altezzaMin} onChange={(e) => setAltezzaMin(parseInt(e.target.value) || 0)} className="text-right" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Altezza max</Label>
                  <Input type="number" min={0} value={altezzaMax} onChange={(e) => setAltezzaMax(parseInt(e.target.value) || 9999)} className="text-right" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label>Minimo fatturabile</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} step={0.01} value={mqMinimo} onChange={(e) => setMqMinimo(parseFloat(e.target.value) || 0)} className="text-right" />
                    <span className="text-xs text-gray-400 shrink-0">mq</span>
                  </div>
                  <p className="text-xs text-gray-400">0 = nessun minimo</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Stato</Label>
                  <div className="flex gap-2 mt-1">
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setAttivo(v)}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${attivo === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}
                      >
                        {v ? '✓ Attivo' : '✗ Disattivo'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Immagine prodotto */}
              <div className="space-y-2 border-t pt-3">
                <Label>Immagine prodotto</Label>
                {immagineUrl ? (
                  <div className="flex items-center gap-3">
                    <Image
                      src={immagineUrl}
                      alt=""
                      width={80}
                      height={80}
                      className="rounded-md object-cover border border-gray-200"
                    />
                    <div className="space-y-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImg}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {uploadingImg ? 'Caricamento...' : 'Sostituisci'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setImmagineUrl(null)}
                        className="text-red-500 hover:text-red-700 block"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Rimuovi
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center h-24 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">{uploadingImg ? 'Caricamento...' : 'Clicca per caricare'}</span>
                    <span className="text-xs text-gray-400 mt-0.5">PNG, JPG, WEBP — ridimensionata a 600px</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </TabsContent>

            {/* ── Tab Finiture ──────────────────────────────────────── */}
            <TabsContent value="finiture" className="space-y-3 mt-0">
              <p className="text-xs text-gray-500">
                Le finiture aggiungono una maggiorazione al prezzo del prodotto.
              </p>
              {finiture.map((f, i) => (
                <div key={i} className="rounded-md border border-gray-200 p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                    <Input
                      value={f.nome}
                      onChange={(e) => updateFinitura(i, 'nome', e.target.value)}
                      placeholder="Nome finitura"
                      className="flex-1"
                    />
                    <button type="button" onClick={() => removeFinitura(i)} className="text-red-400 hover:text-red-600 shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pl-6">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo maggiorazione</Label>
                      <Select value={f.tipo_maggiorazione} onValueChange={(v) => updateFinitura(i, 'tipo_maggiorazione', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_MAG_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valore {f.tipo_maggiorazione === 'percentuale' ? '(%)' : '(€)'}</Label>
                      <Input type="number" min={0} step={0.01} value={f.valore} onChange={(e) => updateFinitura(i, 'valore', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-right" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Costo acquisto (€)</Label>
                      <Input type="number" min={0} step={0.01} value={f.prezzo_acquisto} onChange={(e) => updateFinitura(i, 'prezzo_acquisto', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-right" />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setFiniture((p) => [...p, emptyFinitura(p.length)])}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi finitura
              </Button>
            </TabsContent>

            {/* ── Tab Accessori ─────────────────────────────────────── */}
            <TabsContent value="accessori" className="space-y-3 mt-0">
              <p className="text-xs text-gray-500">
                Organizza gli accessori in gruppi. Ogni gruppo può essere a scelta singola, multipla o sempre incluso.
              </p>
              {gruppi.map((g, gi) => (
                <div key={g._key} className="rounded-md border border-gray-200 bg-gray-50">
                  {/* Header gruppo */}
                  <div className="flex items-center gap-2 p-3">
                    <button type="button" onClick={() => toggleGruppo(gi)} className="text-gray-400 hover:text-gray-600 shrink-0">
                      {g.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <Input
                      value={g.nome}
                      onChange={(e) => updateGruppo(gi, 'nome', e.target.value)}
                      placeholder="Nome gruppo (es. Trattamento vetro)"
                      className="flex-1 h-8 text-sm font-medium"
                    />
                    <Select value={g.tipo_scelta} onValueChange={(v) => updateGruppo(gi, 'tipo_scelta', v as GruppoState['tipo_scelta'])}>
                      <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SCELTA_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={() => removeGruppo(gi)} className="text-red-400 hover:text-red-600 shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Accessori del gruppo */}
                  {g.expanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-gray-200 pt-2">
                      {g.accessori.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">Nessun accessorio</p>
                      )}
                      {g.accessori.map((a, ai) => (
                        <div key={ai} className="rounded border border-gray-100 bg-white p-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={a.nome}
                              onChange={(e) => updateAccessorio(gi, ai, 'nome', e.target.value)}
                              placeholder="Nome accessorio"
                              className="flex-1 h-8 text-sm"
                            />
                            <button type="button" onClick={() => removeAccessorio(gi, ai)} className="text-red-400 hover:text-red-600 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Unità</Label>
                              <Select value={a.unita} onValueChange={(v) => updateAccessorio(gi, ai, 'unita', v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.entries(UNITA_LABEL).map(([k, v]) => (
                                    <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Prezzo ({a.unita === 'pz' ? '€/pz' : a.unita === 'mq' ? '€/mq' : '€/ml'})</Label>
                              <Input type="number" min={0} step={0.01} value={a.prezzo} onChange={(e) => updateAccessorio(gi, ai, 'prezzo', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Qt. default</Label>
                              <Input type="number" min={0} step={0.1} value={a.qty_default} onChange={(e) => updateAccessorio(gi, ai, 'qty_default', parseFloat(e.target.value) || 1)} className="h-7 text-xs text-right" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Qt. libera</Label>
                              <button
                                type="button"
                                onClick={() => updateAccessorio(gi, ai, 'qty_modificabile', !a.qty_modificabile)}
                                className={`w-full h-7 rounded border text-xs transition-colors ${a.qty_modificabile ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}
                              >
                                {a.qty_modificabile ? 'Sì' : 'No'}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Prezzo acquisto</Label>
                              <Input type="number" min={0} step={0.01} value={a.prezzo_acquisto} onChange={(e) => updateAccessorio(gi, ai, 'prezzo_acquisto', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addAccessorio(gi)} className="w-full h-7 text-xs">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi accessorio
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setGruppi((p) => [...p, emptyGruppo(p.length)])}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi gruppo
              </Button>
            </TabsContent>

          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : listino ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
