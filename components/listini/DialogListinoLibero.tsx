'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createListinoLibero, updateListinoLibero, getCurrentOrgId } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ListinoLiberoCompleto } from '@/types/listino'

interface ProdottoInput {
  nome: string
  prezzo: string
  prezzo_acquisto: string
  descrizione: string
  immagine_url: string | null
  // solo per upload temporaneo
  _blob?: Blob | null
  _preview?: string | null
}

interface AccessorioInput {
  nome: string
  prezzo: string
  prezzo_acquisto: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoriaId: string
  listino?: ListinoLiberoCompleto
  onSuccess: () => void
}

async function resizeProductImage(file: File): Promise<{ blob: Blob; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        return reject(new Error('Canvas non disponibile'))
      }
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Conversione immagine fallita'))
          resolve({ blob, preview: canvas.toDataURL('image/webp') })
        },
        'image/webp',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Immagine non valida'))
    }
    img.src = objectUrl
  })
}

function initProdotti(listino?: ListinoLiberoCompleto): ProdottoInput[] {
  return (listino?.prodotti ?? []).map((p) => ({
    nome: p.nome,
    prezzo: p.prezzo.toString(),
    prezzo_acquisto: (p.prezzo_acquisto ?? 0).toString(),
    descrizione: p.descrizione ?? '',
    immagine_url: p.immagine_url ?? null,
  }))
}

function initAccessori(listino?: ListinoLiberoCompleto): AccessorioInput[] {
  return (listino?.accessori ?? []).map((a) => ({
    nome: a.nome,
    prezzo: a.prezzo.toString(),
    prezzo_acquisto: (a.prezzo_acquisto ?? 0).toString(),
  }))
}

export default function DialogListinoLibero({
  open,
  onOpenChange,
  categoriaId,
  listino,
  onSuccess,
}: Props) {
  const [tipologia, setTipologia] = useState(listino?.tipologia ?? '')
  const [prodotti, setProdotti] = useState<ProdottoInput[]>(initProdotti(listino))
  const [accessori, setAccessori] = useState<AccessorioInput[]>(initAccessori(listino))
  const [saving, setSaving] = useState(false)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleOpenChange = (val: boolean) => {
    if (val) {
      setTipologia(listino?.tipologia ?? '')
      setProdotti(initProdotti(listino))
      setAccessori(initAccessori(listino))
    }
    onOpenChange(val)
  }

  // ---- Prodotti ----
  const addProdotto = () =>
    setProdotti((prev) => [...prev, { nome: '', prezzo: '0', prezzo_acquisto: '0', descrizione: '', immagine_url: null }])

  const removeProdotto = (i: number) =>
    setProdotti((prev) => prev.filter((_, idx) => idx !== i))

  const updateProdotto = (i: number, field: keyof ProdottoInput, value: string) =>
    setProdotti((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    )

  const handleProdottoImage = async (i: number, file: File) => {
    try {
      const { blob, preview } = await resizeProductImage(file)
      setProdotti((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, _blob: blob, _preview: preview, immagine_url: preview } : p
        )
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore upload immagine')
    }
  }

  const removeProdottoImage = (i: number) =>
    setProdotti((prev) =>
      prev.map((p, idx) =>
        idx === i ? { ...p, _blob: null, _preview: null, immagine_url: null } : p
      )
    )

  // ---- Accessori ----
  const addAccessorio = () =>
    setAccessori((prev) => [...prev, { nome: '', prezzo: '0', prezzo_acquisto: '0' }])

  const removeAccessorio = (i: number) =>
    setAccessori((prev) => prev.filter((_, idx) => idx !== i))

  const updateAccessorio = (i: number, field: 'nome' | 'prezzo' | 'prezzo_acquisto', value: string) =>
    setAccessori((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a))
    )

  // ---- Salvataggio ----
  const handleSave = async () => {
    if (!tipologia.trim()) {
      toast.error('Inserisci il nome del listino')
      return
    }
    if (prodotti.some((p) => !p.nome.trim())) {
      toast.error('Tutti i prodotti devono avere un nome')
      return
    }
    if (accessori.some((a) => !a.nome.trim())) {
      toast.error('Tutti gli accessori devono avere un nome')
      return
    }

    setSaving(true)
    try {
      const orgId = await getCurrentOrgId()
      const supabase = createClient()

      // Carica immagini prodotti se presenti
      const prodottiFinalizzati = await Promise.all(
        prodotti.map(async (p) => {
          let imageUrl = p.immagine_url

          // Se ha un blob da caricare (nuova immagine)
          if (p._blob) {
            const fileName = `${orgId}/${crypto.randomUUID()}.webp`
            const { data, error } = await supabase.storage
              .from('listini-immagini')
              .upload(fileName, p._blob, { contentType: 'image/webp' })
            if (error) throw new Error('Errore upload: ' + error.message)
            const { data: { publicUrl } } = supabase.storage
              .from('listini-immagini')
              .getPublicUrl(data.path)
            imageUrl = publicUrl
          } else if (p._blob === null && p._preview === null) {
            // Immagine rimossa
            imageUrl = null
          }

          return {
            nome: p.nome.trim(),
            prezzo: parseFloat(p.prezzo) || 0,
            prezzo_acquisto: parseFloat(p.prezzo_acquisto) || 0,
            descrizione: p.descrizione.trim() || null,
            immagine_url: imageUrl,
          }
        })
      )

      const accessoriDati = accessori.map((a) => ({
        nome: a.nome.trim(),
        prezzo: parseFloat(a.prezzo) || 0,
        prezzo_acquisto: parseFloat(a.prezzo_acquisto) || 0,
      }))

      if (listino) {
        await updateListinoLibero(listino.id, {
          tipologia: tipologia.trim(),
          prodotti: prodottiFinalizzati,
          accessori: accessoriDati,
        })
        toast.success('Listino aggiornato')
      } else {
        await createListinoLibero({
          categoria_id: categoriaId,
          tipologia: tipologia.trim(),
          prodotti: prodottiFinalizzati,
          accessori: accessoriDati,
        })
        toast.success('Listino creato')
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{listino ? 'Modifica listino' : 'Nuovo listino'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Nome listino */}
          <div className="space-y-1.5">
            <Label>Nome listino</Label>
            <Input
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value)}
              placeholder="es. Zanzariere, Persiane, ..."
            />
          </div>

          {/* Prodotti */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Prodotti</p>
              <Button type="button" variant="outline" size="sm" onClick={addProdotto}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Aggiungi prodotto
              </Button>
            </div>

            {prodotti.length === 0 && (
              <p className="text-xs text-gray-400 italic">Nessun prodotto aggiunto.</p>
            )}

            <div className="space-y-3">
              {prodotti.map((p, i) => (
                <div key={i} className="rounded-md border bg-gray-50/50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {/* Immagine prodotto */}
                    <div className="shrink-0">
                      {p.immagine_url && (p._preview || p.immagine_url.startsWith('http')) ? (
                        <div className="relative w-16 h-12">
                          <img
                            src={p._preview ?? p.immagine_url}
                            alt={p.nome}
                            className="w-16 h-12 rounded object-cover border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeProdottoImage(i)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-600"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[i]?.click()}
                          className="w-16 h-12 rounded border-2 border-dashed border-gray-300 bg-white hover:border-gray-400 flex flex-col items-center justify-center gap-0.5 transition-colors"
                        >
                          <Upload className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-[10px] text-gray-400">Foto</span>
                        </button>
                      )}
                      <input
                        ref={(el) => { fileInputRefs.current[i] = el }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleProdottoImage(i, file)
                          if (e.target) e.target.value = ''
                        }}
                      />
                    </div>

                    {/* Campi prodotto */}
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          value={p.nome}
                          onChange={(e) => updateProdotto(i, 'nome', e.target.value)}
                          placeholder="es. Zanzariera a rullo"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">P. Vendita (€)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={p.prezzo}
                          onChange={(e) => updateProdotto(i, 'prezzo', e.target.value)}
                          className="h-8 text-sm text-right"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-amber-700">P. Acquisto (€)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={p.prezzo_acquisto}
                          onChange={(e) => updateProdotto(i, 'prezzo_acquisto', e.target.value)}
                          className="h-8 text-sm text-right border-amber-200 focus:border-amber-400"
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <Label className="text-xs">Descrizione (opzionale)</Label>
                        <Input
                          value={p.descrizione}
                          onChange={(e) => updateProdotto(i, 'descrizione', e.target.value)}
                          placeholder="es. Con guida superiore in alluminio"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-600 shrink-0"
                      onClick={() => removeProdotto(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Accessori */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Accessori</p>
                <p className="text-xs text-gray-400">Opzioni aggiuntive disponibili per tutti i prodotti</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addAccessorio}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Aggiungi accessorio
              </Button>
            </div>

            {accessori.length === 0 && (
              <p className="text-xs text-gray-400 italic">Nessun accessorio aggiunto.</p>
            )}

            <div className="space-y-2">
              {accessori.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={a.nome}
                    onChange={(e) => updateAccessorio(i, 'nome', e.target.value)}
                    placeholder="es. Kit zanzariera laterale"
                    className="h-8 text-sm flex-1"
                  />
                  <div className="flex items-center gap-1 w-28">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={a.prezzo}
                      onChange={(e) => updateAccessorio(i, 'prezzo', e.target.value)}
                      className="h-8 text-sm text-right"
                      title="Prezzo vendita (€)"
                    />
                    <span className="text-xs text-gray-400 shrink-0">€</span>
                  </div>
                  <div className="flex items-center gap-1 w-28">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={a.prezzo_acquisto}
                      onChange={(e) => updateAccessorio(i, 'prezzo_acquisto', e.target.value)}
                      className="h-8 text-sm text-right border-amber-200 focus:border-amber-400"
                      title="Prezzo acquisto (€)"
                    />
                    <span className="text-xs text-amber-600 shrink-0">acq</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => removeAccessorio(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : listino ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
