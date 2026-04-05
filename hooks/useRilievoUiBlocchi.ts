'use client'

import { useState, useEffect } from 'react'

export interface BloccoUIConfig {
  tipo: string
  label: string
  colore: string
  ordine: number
}

const DEFAULTS: BloccoUIConfig[] = [
  { tipo: 'struttura',  label: 'Strutture',          colore: '#3b82f6', ordine: 0 },
  { tipo: 'accessorio', label: 'Finitura / Accessori',colore: '#f59e0b', ordine: 1 },
  { tipo: 'colore',     label: 'Colori',              colore: '#ec4899', ordine: 2 },
  { tipo: 'vetro',      label: 'Tipologie vetro',     colore: '#06b6d4', ordine: 3 },
  { tipo: 'serratura',  label: 'Serrature',           colore: '#ef4444', ordine: 4 },
  { tipo: 'serie',      label: 'Serie profili',       colore: '#8b5cf6', ordine: 5 },
  { tipo: 'telaio',    label: 'Tipologie telaio',    colore: '#0d9488', ordine: 6 },
]

const LS_KEY = 'rilievo-ui-blocchi-v1'

export function useRilievoUiBlocchi() {
  const [blocchi, setBlocchi] = useState<BloccoUIConfig[]>(DEFAULTS)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const saved: BloccoUIConfig[] = JSON.parse(raw)
      // Merge: mantieni defaults per tipi nuovi, applica saved per quelli esistenti
      const merged = DEFAULTS.map((def) => {
        const s = saved.find((x) => x.tipo === def.tipo)
        return s ? { ...def, colore: s.colore, ordine: s.ordine } : def
      })
      merged.sort((a, b) => a.ordine - b.ordine)
      setBlocchi(merged)
    } catch { /* ignore */ }
  }, [])

  const persist = (newBlocchi: BloccoUIConfig[]) => {
    setBlocchi(newBlocchi)
    try { localStorage.setItem(LS_KEY, JSON.stringify(newBlocchi)) } catch { /* ignore */ }
  }

  const updateColore = (tipo: string, colore: string) => {
    persist(blocchi.map((b) => b.tipo === tipo ? { ...b, colore } : b))
  }

  const reorder = (oldIdx: number, newIdx: number) => {
    const next = [...blocchi]
    const [moved] = next.splice(oldIdx, 1)
    next.splice(newIdx, 0, moved)
    persist(next.map((b, i) => ({ ...b, ordine: i })))
  }

  const getColore = (tipo: string) =>
    blocchi.find((b) => b.tipo === tipo)?.colore ?? '#6b7280'

  return { blocchi, updateColore, reorder, getColore }
}
