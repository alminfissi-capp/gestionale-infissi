import Dexie, { type EntityTable } from 'dexie'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { PreventivoInput } from '@/types/preventivo'
import type { VanoMisurato } from '@/lib/rilievo'

export interface PendingPreventivo {
  tempId?: number
  input: PreventivoInput
  createdAt: string
}

export interface RilievoSessione {
  id: string
  vani: VanoMisurato[]
  updatedAt: string
}

export interface VanoCanvasState {
  vanoId: string
  telai: Array<{ id: string; tipo: string; lati: string }>
  localInput: Record<string, number>
  updatedAt: string
}

class GestionaleDB extends Dexie {
  clienti!: EntityTable<Cliente, 'id'>
  listiniData!: EntityTable<CategoriaConListini, 'id'>
  pendingPreventivi!: EntityTable<PendingPreventivo, 'tempId'>
  rilievoSessione!: EntityTable<RilievoSessione, 'id'>
  vanoCanvas!: EntityTable<VanoCanvasState, 'vanoId'>

  constructor() {
    super('gestionale-infissi')
    this.version(1).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
    })
    this.version(2).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
    })
  }
}

export const db = new GestionaleDB()
