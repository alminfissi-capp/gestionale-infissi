'use client'

/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Camera, Check, ChevronDown, ChevronUp, Loader2, Star, Landmark,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  setPagatoScadenza,
  deleteScadenza,
  updateScadenza,
  uploadFotoScadenza,
  removeFotoScadenza,
  getFotoScadenzaUrl,
  toggleCalcoliScadenza,
  riordinaScadenze,
} from '@/actions/scadenze'
import { formatEuro } from '@/lib/pricing'
import { ocrAssegno } from '@/lib/ocrAssegno'
import DialogScadenza from './DialogScadenza'
import type { Scadenza, CategoriaScadenza, ContoCorrente } from '@/types/commessa'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const meseDi = (data: string) => Number(data.slice(5, 7))
const giornoDi = (data: string) => Number(data.slice(8, 10))

const CAT_BADGE: Record<CategoriaScadenza, { label: string; cls: string } | null> = {
  finanziamento: { label: 'Finanz.', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  assegno: { label: 'Assegno', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  altro: null,
}

// Bordo sinistro colorato per distinguere a colpo d'occhio assegni e rate
const CAT_BORDER: Record<CategoriaScadenza, string> = {
  finanziamento: 'border-l-purple-400',
  assegno: 'border-l-blue-400',
  altro: 'border-l-transparent',
}

interface Props {
  gruppoId: string
  gruppoNome: string
  scadenze: Scadenza[]
  fornitori: string[]
  conti: ContoCorrente[]
}

export default function ScadenzeView({ gruppoId, gruppoNome, scadenze, fornitori, conti }: Props) {
  const router = useRouter()
  const contoNome = useMemo(
    () => Object.fromEntries(conti.map((c) => [c.id, c.nome])) as Record<string, string>,
    [conti]
  )

  const anno = useMemo(() => {
    const n = parseInt(gruppoNome, 10)
    if (!isNaN(n) && n > 1900) return n
    if (scadenze.length > 0) return Number(scadenze[0].data_scadenza.slice(0, 4))
    return new Date().getFullYear()
  }, [gruppoNome, scadenze])

  // Stato locale sincronizzato con i dati server (adjust-state-during-render)
  const [items, setItems] = useState<Scadenza[]>(scadenze)
  const [prevScad, setPrevScad] = useState(scadenze)
  // Mesi aperti (fisarmonica): di default i mesi che hanno scadenze
  const mesiConRighe = (list: Scadenza[]) => new Set(list.map((s) => meseDi(s.data_scadenza)))
  const [openMonths, setOpenMonths] = useState<Set<number>>(() => mesiConRighe(scadenze))
  if (prevScad !== scadenze) {
    setPrevScad(scadenze)
    setItems(scadenze)
    setOpenMonths((cur) => new Set([...cur, ...mesiConRighe(scadenze)]))
  }

  const toggleMonth = (m: number) =>
    setOpenMonths((cur) => {
      const next = new Set(cur)
      if (next.has(m)) next.delete(m); else next.add(m)
      return next
    })
  const openMonth = (m: number) => setOpenMonths((cur) => new Set(cur).add(m))

  // Dialog add/edit
  const [dialog, setDialog] = useState<{ scadenza: Scadenza | null; defaultData: string } | null>(null)

  // Lightbox foto
  const [lightbox, setLightbox] = useState<{ url: string; scadenza: Scadenza } | null>(null)

  // URL firmati delle foto + upload/OCR in corso
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Carica gli URL firmati per le righe con foto
  useEffect(() => {
    let cancelled = false
    const conFoto = items.filter((s) => s.foto_path)
    if (conFoto.length === 0) { setFotoUrls({}); return }
    const load = async () => {
      const map: Record<string, string> = {}
      await Promise.all(
        conFoto.map(async (s) => {
          try { map[s.id] = await getFotoScadenzaUrl(s.foto_path!) } catch { /* ignora */ }
        })
      )
      if (!cancelled) setFotoUrls(map)
    }
    load()
    return () => { cancelled = true }
  }, [items])

  const handleTogglePagato = async (s: Scadenza) => {
    const nuovo = !s.pagato
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: nuovo } : x)))
    try {
      await setPagatoScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, pagato: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleToggleCalcoli = async (s: Scadenza) => {
    const nuovo = !s.in_calcoli
    setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: nuovo } : x)))
    try {
      await toggleCalcoliScadenza(s.id, nuovo)
    } catch {
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, in_calcoli: !nuovo } : x)))
      toast.error('Errore nel salvataggio')
    }
  }

  const handleDelete = async (s: Scadenza) => {
    if (!confirm('Eliminare questa scadenza?')) return
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== s.id))
    try {
      await deleteScadenza(s.id)
      router.refresh()
    } catch {
      setItems(prev)
      toast.error("Errore nell'eliminazione")
    }
  }

  const handleFotoSelected = async (s: Scadenza, file: File | null) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('Foto troppo grande (max 20 MB)'); return }
    setUploadingId(s.id)
    if (s.categoria === 'assegno') toast.info('Lettura assegno in corso…')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('scadenzaId', s.id)
      const ocrPromise = s.categoria === 'assegno'
        ? ocrAssegno(file)
        : Promise.resolve({ numero: null, importo: null, data: null })
      const [res, ocr] = await Promise.all([uploadFotoScadenza(fd), ocrPromise])
      if (res.error) throw new Error(res.error)
      // Aggiorna i campi letti: numero in descrizione, importo solo se ancora a 0
      const patch: { descrizione?: string; importo?: number } = {}
      if (ocr.numero) patch.descrizione = `Assegno n. ${ocr.numero}`
      if (ocr.importo != null && !s.importo) patch.importo = ocr.importo
      if (Object.keys(patch).length > 0) {
        await updateScadenza(s.id, patch)
        setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
      }
      if (s.categoria === 'assegno') {
        toast.success(ocr.numero || ocr.importo != null ? 'Foto allegata · dati letti' : 'Foto allegata (nessun dato riconosciuto)')
      } else {
        toast.success('Foto allegata')
      }
      router.refresh()
    } catch {
      toast.error('Errore nel caricamento della foto')
    } finally {
      setUploadingId(null)
      if (fileRefs.current[s.id]) fileRefs.current[s.id]!.value = ''
    }
  }

  const handleRemoveFoto = async (s: Scadenza) => {
    if (!s.foto_path) return
    if (!confirm('Rimuovere la foto?')) return
    try {
      await removeFotoScadenza(s.id, s.foto_path)
      setLightbox(null)
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    }
  }

  // Raggruppa per mese
  const perMese = useMemo(() => {
    const map = new Map<number, Scadenza[]>()
    for (const s of items) {
      const m = meseDi(s.data_scadenza)
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(s)
    }
    for (const arr of map.values()) {
      // Ordine manuale (su/giù); a parità ripiega sul giorno del mese
      arr.sort((a, b) => (a.ordine - b.ordine) || (giornoDi(a.data_scadenza) - giornoDi(b.data_scadenza)))
    }
    return map
  }, [items])

  const handleMove = async (mese: number, idx: number, dir: -1 | 1) => {
    const righe = perMese.get(mese) ?? []
    const target = idx + dir
    if (target < 0 || target >= righe.length) return
    const reordered = [...righe]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(target, 0, moved)
    const ids = reordered.map((r) => r.id)
    // Update ottimistico: assegna ordine = posizione nel mese
    setItems((cur) => cur.map((x) => {
      const pos = ids.indexOf(x.id)
      return pos === -1 ? x : { ...x, ordine: pos }
    }))
    try {
      await riordinaScadenze(ids)
    } catch {
      toast.error('Errore nel riordino')
      router.refresh()
    }
  }

  const totali = useMemo(() => {
    const daPagare = items.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
    const pagato = items.reduce((s, x) => s + (x.pagato ? x.importo : 0), 0)
    return { daPagare, pagato, totale: daPagare + pagato }
  }, [items])

  return (
    <div className="space-y-4 pb-10">
      {/* Riepilogo anno */}
      <div className="rounded-md border bg-white p-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-2">
        <div className="mr-auto text-sm text-gray-500">{items.length} scadenze nel {anno}</div>
        <div className="text-sm text-gray-600">
          Pagato: <span className="font-semibold text-emerald-700">{formatEuro(totali.pagato)}</span>
        </div>
        <div className="text-base text-rose-800">
          Da pagare: <span className="font-bold">{formatEuro(totali.daPagare)}</span>
        </div>
      </div>

      {/* 12 mesi a fisarmonica */}
      <div className="space-y-2">
        {MESI.map((nomeMese, i) => {
          const mese = i + 1
          const righe = perMese.get(mese) ?? []
          const daPagareMese = righe.reduce((s, x) => s + (x.pagato ? 0 : x.importo), 0)
          const defaultData = `${anno}-${pad2(mese)}-01`
          const aperto = openMonths.has(mese)

          return (
            <div key={mese} className="rounded-md border bg-white overflow-hidden">
              <div className="flex items-center justify-between px-2 sm:px-3 py-2 bg-gray-50/70 border-b">
                <button
                  type="button"
                  onClick={() => toggleMonth(mese)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left py-1"
                >
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aperto ? '' : '-rotate-90'}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{nomeMese}</h3>
                  {righe.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{righe.length}</Badge>
                  )}
                  {daPagareMese > 0 && (
                    <span className="text-xs text-rose-600 font-medium truncate">
                      {formatEuro(daPagareMese)} da pagare
                    </span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-rose-700 shrink-0"
                  onClick={() => { openMonth(mese); setDialog({ scadenza: null, defaultData }) }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Aggiungi
                </Button>
              </div>

              {aperto && righe.length > 0 && (
                <div className="divide-y">
                  {righe.map((s, idx) => {
                    const badge = CAT_BADGE[s.categoria]
                    const rata = s.numero_rata != null
                      ? `Rata ${s.numero_rata}${s.totale_rate ? `/${s.totale_rate}` : ''}`
                      : null
                    return (
                      <div key={s.id} className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 border-l-4 ${CAT_BORDER[s.categoria]} ${s.pagato ? 'bg-emerald-50/40' : ''}`}>
                        {/* Pagato toggle */}
                        <button
                          type="button"
                          onClick={() => handleTogglePagato(s)}
                          title={s.pagato ? 'Segna come da pagare' : 'Segna come pagata'}
                          className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                            s.pagato
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-gray-300 text-transparent hover:border-emerald-400'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>

                        {/* Giorno */}
                        <div className="w-8 shrink-0 text-center">
                          <span className="text-sm font-semibold text-gray-700">{giornoDi(s.data_scadenza)}</span>
                        </div>

                        {/* Fornitore + descrizione */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-800 truncate max-w-full">
                              {s.fornitore || <span className="text-gray-400">—</span>}
                            </p>
                            {badge && (
                              <span className={`text-[10px] rounded border px-1 py-0 font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            )}
                            {rata && (
                              <span className="text-[10px] rounded border border-gray-200 bg-gray-50 text-gray-500 px-1 py-0">
                                {rata}
                              </span>
                            )}
                            {s.conto_id && contoNome[s.conto_id] && (
                              <span className="sm:hidden inline-flex items-center gap-0.5 text-[10px] rounded border border-slate-200 bg-slate-50 text-slate-600 px-1 py-0">
                                <Landmark className="h-2.5 w-2.5" />
                                {contoNome[s.conto_id]}
                              </span>
                            )}
                          </div>
                          {s.descrizione && (
                            <p className="text-xs text-gray-500 truncate">{s.descrizione}</p>
                          )}
                        </div>

                        {/* Conto corrente (colonna allineata, da tablet in su) */}
                        <div className="hidden sm:flex w-32 shrink-0 items-center gap-1 text-xs">
                          {s.conto_id && contoNome[s.conto_id] ? (
                            <>
                              <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate text-slate-700 font-medium">{contoNome[s.conto_id]}</span>
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>

                        {/* Foto */}
                        <input
                          ref={(el) => { fileRefs.current[s.id] = el }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleFotoSelected(s, e.target.files?.[0] ?? null)}
                        />
                        {uploadingId === s.id ? (
                          <div className="h-12 w-20 shrink-0 rounded border bg-gray-50 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          </div>
                        ) : s.foto_path ? (
                          fotoUrls[s.id] ? (
                            <button
                              type="button"
                              onClick={() => setLightbox({ url: fotoUrls[s.id], scadenza: s })}
                              className="h-12 w-20 shrink-0 rounded border overflow-hidden bg-gray-50 hover:ring-2 hover:ring-rose-300"
                              title="Apri foto"
                            >
                              <img src={fotoUrls[s.id]} alt="foto scadenza" className="h-full w-full object-contain" />
                            </button>
                          ) : (
                            <div className="h-12 w-20 shrink-0 rounded border bg-gray-100 animate-pulse" />
                          )
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-gray-400 hover:text-rose-600"
                            title={s.categoria === 'assegno' ? 'Allega foto assegno (legge il numero)' : 'Allega foto'}
                            onClick={() => fileRefs.current[s.id]?.click()}
                          >
                            <Camera className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Importo */}
                        <div className="w-24 shrink-0 text-right">
                          <span className={`text-sm font-semibold ${s.pagato ? 'text-emerald-700 line-through' : 'text-gray-900'}`}>
                            {formatEuro(s.importo)}
                          </span>
                        </div>

                        {/* Stella Calcoli */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title={s.in_calcoli ? 'Rimuovi dai Calcoli' : 'Aggiungi ai Calcoli'}
                          onClick={() => handleToggleCalcoli(s)}
                        >
                          <Star className={`h-4 w-4 ${s.in_calcoli ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-400'}`} />
                        </Button>

                        {/* Azioni */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700"
                          title="Modifica"
                          onClick={() => setDialog({ scadenza: s, defaultData: s.data_scadenza })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-500"
                          title="Elimina"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>

                        {/* Riordino su/giù */}
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMove(mese, idx, -1)}
                            title="Sposta su"
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === righe.length - 1}
                            onClick={() => handleMove(mese, idx, 1)}
                            title="Sposta giù"
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog add/edit */}
      {dialog && (
        <DialogScadenza
          open
          onOpenChange={(v) => { if (!v) setDialog(null) }}
          gruppoId={gruppoId}
          scadenza={dialog.scadenza}
          defaultData={dialog.defaultData}
          fornitori={fornitori}
          conti={conti}
        />
      )}

      {/* Lightbox foto */}
      <Dialog open={!!lightbox} onOpenChange={(v) => { if (!v) setLightbox(null) }}>
        <DialogContent className="max-w-3xl p-2 sm:p-3">
          {lightbox && (
            <div className="space-y-2">
              <img
                src={lightbox.url}
                alt="foto scadenza"
                className="w-full max-h-[80vh] object-contain rounded"
              />
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-gray-500 truncate">
                  {lightbox.scadenza.fornitore || 'Foto scadenza'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => handleRemoveFoto(lightbox.scadenza)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Rimuovi foto
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
