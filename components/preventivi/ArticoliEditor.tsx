'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Table2, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TabellaArticoli from './TabellaArticoli'
import FormVoceLibera from './FormVoceLibera'
import DialogConfigurazione from './DialogConfigurazione'
import IconaCategoria from '@/components/listini/IconaCategoria'
import { formatEuro } from '@/lib/pricing'
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
  const [categoriaSel, setCategoriaSel] = useState<string>(listini[0]?.id ?? '')
  const [voceLibera, setVoceLibera] = useState(false)
  const [itemConfig, setItemConfig] = useState<ItemSel | null>(null)

  const categoria = listini.find((c) => c.id === categoriaSel)

  const handleSelectCategoria = (id: string) => {
    setCategoriaSel(id)
    setVoceLibera(false)
  }

  const handleVoceLibera = () => {
    setCategoriaSel('')
    setVoceLibera(true)
  }

  const handleAdd = (a: ArticoloWizard) => {
    onArticoliChange([...articoli, a])
    setItemConfig(null)
    setVoceLibera(false)
  }

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onAnnulla}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            title="Torna al cliente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-semibold text-gray-900 text-base">Seleziona articoli</h2>
          {articoli.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {articoli.length} {articoli.length === 1 ? 'articolo' : 'articoli'}
            </Badge>
          )}
        </div>
        <Button onClick={onConferma} disabled={articoli.length === 0}>
          Continua al riepilogo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── Left: category panel ────────────────────────────────────── */}
        <div className="w-56 border-r flex flex-col shrink-0 bg-gray-50">
          <div className="px-3 py-2.5 border-b">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Categorie
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {listini.map((cat) => {
              const isActive = categoriaSel === cat.id && !voceLibera
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategoria(cat.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-blue-50 border border-blue-200 text-blue-800 shadow-sm'
                      : 'hover:bg-white text-gray-700 border border-transparent hover:border-gray-200'
                  }`}
                >
                  <IconaCategoria icona={cat.icona} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">{cat.nome}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {cat.tipo === 'griglia'
                        ? `${cat.listini.length} listini`
                        : `${cat.listini_liberi.reduce((s, l) => s + l.prodotti.length, 0)} prodotti`}
                    </p>
                  </div>
                  {cat.tipo === 'libero' && (
                    <span className="text-[10px] text-teal-600 font-medium shrink-0">cat.</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Voce libera */}
          <div className="p-2 border-t shrink-0">
            <button
              onClick={handleVoceLibera}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                voceLibera
                  ? 'bg-blue-50 border border-blue-200 text-blue-800'
                  : 'hover:bg-white text-gray-500 border border-dashed border-gray-300 hover:border-gray-400'
              }`}
            >
              <FileText className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">Voce libera</span>
            </button>
          </div>
        </div>

        {/* ─── Right: product browser + cart ───────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Product browser */}
          <div className="flex-1 overflow-y-auto p-5">
            {voceLibera ? (
              <div className="max-w-xl">
                <p className="text-sm font-semibold text-gray-700 mb-4">Aggiungi voce libera</p>
                <FormVoceLibera aliquote={aliquote} onAdd={handleAdd} />
              </div>
            ) : !categoria ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Seleziona una categoria dalla lista a sinistra</p>
              </div>
            ) : categoria.tipo === 'griglia' ? (
              <GrigliaPanel categoria={categoria} onSelect={(listino) =>
                setItemConfig({ tipo: 'griglia', listino, categoria })
              } />
            ) : (
              <LiberoPanel categoria={categoria} onSelect={(prodotto, listinoLibero) =>
                setItemConfig({ tipo: 'libero', prodotto, listinoLibero, categoria })
              } />
            )}
          </div>

          {/* Cart */}
          {articoli.length > 0 && (
            <div className="border-t bg-gray-50 flex flex-col" style={{ maxHeight: '280px' }}>
              <div className="px-4 py-2 border-b bg-white flex items-center justify-between shrink-0">
                <p className="text-sm font-semibold text-gray-700">
                  Articoli aggiunti ({articoli.length})
                </p>
              </div>
              <div className="overflow-y-auto p-3">
                <TabellaArticoli
                  articoli={articoli}
                  aliquote={aliquote}
                  onChange={onArticoliChange}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog configurazione */}
      <DialogConfigurazione
        item={itemConfig}
        aliquote={aliquote}
        onAdd={handleAdd}
        onClose={() => setItemConfig(null)}
      />
    </div>
  )
}

// ─── Griglia panel ────────────────────────────────────────────────────────────

function GrigliaPanel({
  categoria,
  onSelect,
}: {
  categoria: CategoriaConListini
  onSelect: (listino: CategoriaConListini['listini'][0]) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-4">{categoria.nome}</p>
      {categoria.listini.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nessun listino in questa categoria.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {categoria.listini.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelect(l)}
              className="group rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left overflow-hidden"
            >
              {l.immagine_url ? (
                <div className="aspect-[4/3] overflow-hidden bg-gray-50">
                  <img
                    src={l.immagine_url}
                    alt={l.tipologia}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                  <Table2 className="h-8 w-8 text-gray-300" />
                </div>
              )}
              <div className="p-2.5">
                <p className="font-medium text-sm text-gray-800 leading-tight">{l.tipologia}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {l.altezze.length}H × {l.larghezze.length}L
                  {l.finiture.length > 0 && ` · ${l.finiture.length} fin.`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Libero panel ─────────────────────────────────────────────────────────────

function LiberoPanel({
  categoria,
  onSelect,
}: {
  categoria: CategoriaConListini
  onSelect: (
    prodotto: CategoriaConListini['listini_liberi'][0]['prodotti'][0],
    listino: CategoriaConListini['listini_liberi'][0]
  ) => void
}) {
  return (
    <div className="space-y-8">
      <p className="text-sm font-semibold text-gray-700">{categoria.nome}</p>
      {categoria.listini_liberi.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nessun listino in questa categoria.</p>
      ) : (
        categoria.listini_liberi.map((ll) => (
          <div key={ll.id}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {ll.tipologia}
            </p>
            {ll.prodotti.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nessun prodotto.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {ll.prodotti.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p, ll)}
                    className="group rounded-xl border border-gray-200 bg-white hover:border-teal-400 hover:shadow-md transition-all text-left overflow-hidden"
                  >
                    {p.immagine_url ? (
                      <div className="aspect-[4/3] overflow-hidden bg-gray-50">
                        <img
                          src={p.immagine_url}
                          alt={p.nome}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                    <div className="p-2.5">
                      <p className="font-medium text-sm text-gray-800 leading-tight">{p.nome}</p>
                      {p.descrizione && (
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                          {p.descrizione}
                        </p>
                      )}
                      <p className="text-xs font-semibold text-teal-700 mt-1">
                        € {formatEuro(p.prezzo)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
