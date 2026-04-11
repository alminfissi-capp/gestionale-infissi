'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, GripVertical, Search, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getCategorie, updateOrdiniCategorie } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CategoriaCard from '@/components/listini/CategoriaCard'
import CategoriaCardLibera from '@/components/listini/CategoriaCardLibera'
import DialogCategoria from '@/components/listini/DialogCategoria'
import { toast } from 'sonner'
import type { CategoriaConListini } from '@/types/listino'

function SortableCategoriaWrapper({ categoria, onSuccess }: { categoria: CategoriaConListini; onSuccess: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: categoria.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  }

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 touch-none"
      tabIndex={-1}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      {categoria.tipo === 'libero' ? (
        <CategoriaCardLibera categoria={categoria} dragHandle={dragHandle} onSuccess={onSuccess} />
      ) : (
        <CategoriaCard categoria={categoria} dragHandle={dragHandle} onSuccess={onSuccess} />
      )}
    </div>
  )
}

export default function ListiniPage() {
  const router = useRouter()
  const [categorie, setCategorie] = useState<CategoriaConListini[]>([])
  const [loading, setLoading] = useState(true)
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [search, setSearch] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const load = async () => {
    setLoading(true)
    try {
      const data = await getCategorie()
      setCategorie(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categorie.findIndex((c) => c.id === active.id)
    const newIndex = categorie.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(categorie, oldIndex, newIndex)

    setCategorie(reordered)
    try {
      await updateOrdiniCategorie(reordered.map((c, i) => ({ id: c.id, ordine: i })))
      router.refresh()
    } catch {
      setCategorie(categorie)
      toast.error('Errore nel riordinamento')
    }
  }

  const categorieFiltered = search.trim()
    ? categorie.filter((c) => c.nome.toLowerCase().includes(search.trim().toLowerCase()))
    : categorie

  const totaleListini = categorie.reduce(
    (sum, c) => sum + c.listini.length + c.listini_liberi.length,
    0
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Listini</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? '...' : `${categorie.length} categorie · ${totaleListini} listini`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/listini/scorrevoli">
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-1" />
              Scorrevoli COPRAL
            </Button>
          </Link>
          <Button onClick={() => setNewCatOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuova categoria
          </Button>
        </div>
      </div>

      {!loading && categorie.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border bg-white animate-pulse" />
          ))}
        </div>
      )}

      {!loading && categorieFiltered.length === 0 && categorie.length > 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">Nessuna categoria trovata</p>
          <p className="text-sm">Prova con un termine di ricerca diverso.</p>
        </div>
      )}

      {!loading && categorie.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">Nessuna categoria</p>
          <p className="text-sm mb-4">Crea una categoria per iniziare ad aggiungere i listini prezzi.</p>
          <Button onClick={() => setNewCatOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Crea prima categoria
          </Button>
        </div>
      )}

      {!loading && categorieFiltered.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={search ? () => {} : handleDragEnd}>
          <SortableContext items={categorieFiltered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {categorieFiltered.map((cat) => (
                <SortableCategoriaWrapper key={cat.id} categoria={cat} onSuccess={load} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <DialogCategoria
        open={newCatOpen}
        onOpenChange={setNewCatOpen}
        onSuccess={() => { load(); router.refresh() }}
      />
    </div>
  )
}
