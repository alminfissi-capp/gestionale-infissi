'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getCategorie } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import CategoriaCard from '@/components/listini/CategoriaCard'
import DialogCategoria from '@/components/listini/DialogCategoria'
import type { CategoriaConListini } from '@/types/listino'

export default function ListiniPage() {
  const router = useRouter()
  const [categorie, setCategorie] = useState<CategoriaConListini[]>([])
  const [loading, setLoading] = useState(true)
  const [newCatOpen, setNewCatOpen] = useState(false)

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Listini</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? '...' : `${categorie.length} categorie · ${categorie.reduce((sum, c) => sum + c.listini.length, 0)} listini`}
          </p>
        </div>
        <Button onClick={() => setNewCatOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuova categoria
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border bg-white animate-pulse" />
          ))}
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

      {!loading && (
        <div className="space-y-4">
          {categorie.map((cat) => (
            <CategoriaCard key={cat.id} categoria={cat} />
          ))}
        </div>
      )}

      <DialogCategoria
        open={newCatOpen}
        onOpenChange={setNewCatOpen}
        onSuccess={() => { load(); router.refresh() }}
      />
    </div>
  )
}
