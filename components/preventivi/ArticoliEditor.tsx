'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Table2, Package, Trash2, Pencil, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormVoceLibera from './FormVoceLibera'
import DialogConfigurazione from './DialogConfigurazione'
import IconaCategoria from '@/components/listini/IconaCategoria'
import { formatEuro, calcolaSubtotale } from '@/lib/pricing'
import type { CategoriaConListini } from '@/types/listino'
import type { ArticoloWizard } from '@/types/preventivo'
import type { ItemSel } from './DialogConfigurazione'

interface Props {
  listini: CategoriaConListini[]
  aliquote: number[]
  articoli: ArticoloWizard[]
  onArticoliChange: (articoli: ArticoloWizard[]) => void
  onConferma: () => void
  onAnnulla: () => void
}

export default function ArticoliEditor({
  listini,
  aliquote,
  articoli,
  onArticoliChange,
  onConferma,
  onAnnulla,
}: Props) {
  const [categoriaSel, setCategoriaSel] = useState<string | 'libera'>(listini[0]?.id ?? 'libera')
  const [itemConfig, setItemConfig] = useState<ItemSel | null>(null)
  const [ricerca, setRicerca] = useState('')
  const [editingTempId, setEditingTempId] = useState<string | null>(null)

  const categoria = listini.find((c) => c.id === categoriaSel)

  const handleSelectCategoria = (id: string | 'libera') => {
    setCategoriaSel(id)
    setRicerca('')
  }

  const findItemSel = (article: ArticoloWizard): ItemSel | null => {
    if (article.tipo === 'listino') {
      for (const cat of listini) {
        const listino = cat.listini.find((l) => l.id === article.listino_id)
        if (listino) return { tipo: 'griglia', listino, categoria: cat }
      }
    } else if (article.tipo === 'listino_libero') {
      for (const cat of listini) {
        const ll = cat.listini_liberi.find((l) => l.id === article.listino_libero_id)
        if (ll) {
          const prodotto = ll.prodotti.find((p) => p.id === article.prodotto_id)
          if (prodotto) return { tipo: 'libero', prodotto, listinoLibero: ll, categoria: cat }
        }
      }
    }
    return null
  }

  const handleEdit = (article: ArticoloWizard) => {
    const item = findItemSel(article)
    if (!item) return
    setEditingTempId(article.tempId)
    setItemConfig(item)
  }

  const handleAddOrEdit = (a: ArticoloWizard) => {
    if (editingTempId) {
      onArticoliChange(articoli.map((art) => art.tempId === editingTempId ? a : art))
      setEditingTempId(null)
    } else {
      onArticoliChange([...articoli, a])
    }
    setItemConfig(null)
  }

  const handleRemove = (tempId: string) => {
    if (editingTempId === tempId) setEditingTempId(null)
    onArticoliChange(articoli.filter((a) => a.tempId !== tempId))
  }

  const subtotale = calcolaSubtotale(articoli)

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 h-13 border-b bg-white shrink-0 shadow-sm" style={{ height: 52 }}>
        <div className="flex items-center gap-2">
          <button
            onClick={onAnnulla}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            title="Torna al cliente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-semibold text-gray-900 text-sm tracking-wide uppercase">
            Compilazione Preventivo
          </h2>
        </div>
        <Button onClick={onConferma} disabled={articoli.length === 0} size="sm">
          Riepilogo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* ── Body: 3 colonne ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── COL 1: Categorie ──────────────────────────────────────── */}
        <div className="w-56 border-r flex flex-col shrink-0 bg-gray-50 overflow-y-auto">
          <div className="px-3 py-2 border-b shrink-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Categorie</p>
          </div>

          <div className="p-2 space-y-1.5 flex-1">
            {/* Voce libera — sempre prima */}
            <button
              onClick={() => handleSelectCategoria('libera')}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-sm font-medium ${
                categoriaSel === 'libera'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">Voce libera</span>
            </button>

            {/* Categorie listini */}
            {listini.map((cat) => {
              const isActive = categoriaSel === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategoria(cat.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <span className="shrink-0">
                    <IconaCategoria icona={cat.icona} size="sm" />
                  </span>
                  <span className="truncate">{cat.nome}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── COL 2: Elenco prodotti ────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          <div className="px-3 py-2 border-b shrink-0 bg-white flex items-center gap-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">
              {categoriaSel === 'libera'
                ? 'Voce libera'
                : categoria
                ? categoria.nome
                : 'Elenco prodotti'}
            </p>
            {categoriaSel !== 'libera' && (
              <div className="relative flex-1 max-w-xs ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input
                  value={ricerca}
                  onChange={(e) => setRicerca(e.target.value)}
                  placeholder="Cerca prodotto..."
                  className="pl-8 pr-7 h-7 text-xs"
                />
                {ricerca && (
                  <button
                    onClick={() => setRicerca('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {categoriaSel === 'libera' ? (
              <div className="p-4 max-w-xl">
                <FormVoceLibera aliquote={aliquote} onAdd={handleAddOrEdit} />
              </div>
            ) : !categoria ? null : categoria.tipo === 'griglia' ? (
              <GrigliaList
                categoria={categoria}
                filtro={ricerca}
                onSelect={(listino) => setItemConfig({ tipo: 'griglia', listino, categoria })}
              />
            ) : (
              <LiberoList
                categoria={categoria}
                filtro={ricerca}
                onSelect={(prodotto, listinoLibero) =>
                  setItemConfig({ tipo: 'libero', prodotto, listinoLibero, categoria })
                }
              />
            )}
          </div>
        </div>

        {/* ─── COL 3: Articoli aggiunti ──────────────────────────────── */}
        <div className="w-80 flex flex-col shrink-0 bg-gray-50 overflow-hidden">
          <div className="px-3 py-2 border-b shrink-0 bg-white">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Articoli</p>
          </div>

          {articoli.length === 0 ? (
            <div className="flex-1 flex items-start justify-center pt-8 px-3">
              <p className="text-xs text-gray-400 text-center italic">
                Nessun articolo.<br />Seleziona un prodotto dalla lista.
              </p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {articoli.map((a) => (
                  <ArticoloCard
                    key={a.tempId}
                    articolo={a}
                    onRemove={() => handleRemove(a.tempId)}
                    onEdit={a.tipo !== 'libera' ? () => handleEdit(a) : undefined}
                  />
                ))}
              </div>

              {/* Subtotale */}
              <div className="border-t px-3 py-2 bg-white shrink-0">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{articoli.length} articoli · {articoli.reduce((s, a) => s + a.quantita, 0)} pz</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs font-semibold text-gray-700">Subtotale</span>
                  <span className="text-sm font-bold text-gray-900">€ {formatEuro(subtotale)}</span>
                </div>
                <Button
                  onClick={onConferma}
                  className="w-full mt-2"
                  size="sm"
                  disabled={articoli.length === 0}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Vai al riepilogo
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialog configurazione */}
      <DialogConfigurazione
        item={itemConfig}
        aliquote={aliquote}
        initialValues={editingTempId ? articoli.find((a) => a.tempId === editingTempId) : undefined}
        isEditing={!!editingTempId}
        onAdd={handleAddOrEdit}
        onClose={() => { setItemConfig(null); setEditingTempId(null) }}
      />
    </div>
  )
}

// ─── Griglia: lista righe ─────────────────────────────────────────────────────

function GrigliaList({
  categoria,
  filtro,
  onSelect,
}: {
  categoria: CategoriaConListini
  filtro: string
  onSelect: (listino: CategoriaConListini['listini'][0]) => void
}) {
  const q = filtro.trim().toLowerCase()
  const listini = q
    ? categoria.listini.filter((l) => l.tipologia.toLowerCase().includes(q))
    : categoria.listini

  if (categoria.listini.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic p-4">Nessun listino in questa categoria.</p>
    )
  }

  if (listini.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic p-4">Nessun prodotto corrisponde a &quot;{filtro}&quot;.</p>
    )
  }

  return (
    <div className="divide-y">
      {listini.map((l) => (
        <button
          key={l.id}
          onClick={() => onSelect(l)}
          className="w-full flex items-center gap-4 px-4 py-3 hover:bg-blue-50 transition-colors text-left group"
        >
          {/* Immagine — object-contain per non tagliare */}
          <div className="w-20 h-14 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
            {l.immagine_url ? (
              <img
                src={l.immagine_url}
                alt={l.tipologia}
                className="w-full h-full object-contain"
              />
            ) : (
              <Table2 className="h-6 w-6 text-gray-300" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-800 group-hover:text-blue-700 leading-tight">
              {l.tipologia}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {l.altezze.length} altezze · {l.larghezze.length} larghezze
              {l.finiture.length > 0 && ` · ${l.finiture.length} finiture`}
            </p>
          </div>

          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ─── Libero: lista righe con prodotti ─────────────────────────────────────────

function LiberoList({
  categoria,
  filtro,
  onSelect,
}: {
  categoria: CategoriaConListini
  filtro: string
  onSelect: (
    prodotto: CategoriaConListini['listini_liberi'][0]['prodotti'][0],
    listino: CategoriaConListini['listini_liberi'][0]
  ) => void
}) {
  const q = filtro.trim().toLowerCase()

  if (categoria.listini_liberi.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic p-4">Nessun listino in questa categoria.</p>
    )
  }

  const listiniFiltrati = categoria.listini_liberi.map((ll) => ({
    ...ll,
    prodotti: q
      ? ll.prodotti.filter(
          (p) =>
            p.nome.toLowerCase().includes(q) ||
            (p.descrizione ?? '').toLowerCase().includes(q)
        )
      : ll.prodotti,
  }))

  const haRisultati = listiniFiltrati.some((ll) => ll.prodotti.length > 0)

  if (q && !haRisultati) {
    return (
      <p className="text-sm text-gray-400 italic p-4">
        Nessun prodotto corrisponde a &quot;{filtro}&quot;.
      </p>
    )
  }

  return (
    <div>
      {listiniFiltrati.map((ll) => {
        if (q && ll.prodotti.length === 0) return null
        return (
        <div key={ll.id}>
          {/* Intestazione listino */}
          <div className="px-4 py-1.5 bg-gray-50 border-b border-t">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {ll.tipologia}
            </p>
          </div>

          {ll.prodotti.length === 0 ? (
            <p className="text-xs text-gray-400 italic px-4 py-2">Nessun prodotto.</p>
          ) : (
            <div className="divide-y">
              {ll.prodotti.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p, ll)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-teal-50 transition-colors text-left group"
                >
                  {/* Immagine — object-contain */}
                  <div className="w-20 h-14 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                    {p.immagine_url ? (
                      <img
                        src={p.immagine_url}
                        alt={p.nome}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-gray-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 group-hover:text-teal-700 leading-tight">
                      {p.nome}
                    </p>
                    {p.descrizione && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.descrizione}</p>
                    )}
                    <p className="text-xs font-semibold text-teal-600 mt-0.5">
                      € {formatEuro(p.prezzo)}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}

// ─── Card articolo nella colonna destra ───────────────────────────────────────

function ArticoloCard({
  articolo,
  onRemove,
  onEdit,
}: {
  articolo: ArticoloWizard
  onRemove: () => void
  onEdit?: () => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2 flex items-start gap-2">
      {/* Immagine — object-contain */}
      {articolo.immagine_url && (
        <div className="w-12 h-9 shrink-0 rounded border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center">
          <img
            src={articolo.immagine_url}
            alt={articolo.tipologia}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">
          {articolo.tipologia}
        </p>
        {articolo.categoria_nome && (
          <p className="text-[10px] text-gray-400 mt-0.5">{articolo.categoria_nome}</p>
        )}
        {articolo.larghezza_mm && (
          <p className="text-[10px] text-gray-400">
            {articolo.larghezza_mm}×{articolo.altezza_mm} mm
          </p>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-gray-500">
            {articolo.quantita} pz
          </span>
          <span className="text-xs font-bold text-gray-800">
            € {formatEuro(articolo.prezzo_totale_riga)}
          </span>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          onClick={onRemove}
          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
