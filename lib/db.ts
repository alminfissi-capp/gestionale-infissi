import Dexie, { type EntityTable } from 'dexie'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { PreventivoInput } from '@/types/preventivo'

export interface PendingPreventivo {
  tempId?: number
  input: PreventivoInput
  createdAt: string
}

class GestionaleDB extends Dexie {
  clienti!: EntityTable<Cliente, 'id'>
  listiniData!: EntityTable<CategoriaConListini, 'id'>
  pendingPreventivi!: EntityTable<PendingPreventivo, 'tempId'>

  constructor() {
    super('gestionale-infissi')
    this.version(1).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
    })
  }
}

export const db = new GestionaleDB()
