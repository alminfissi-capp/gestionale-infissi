import Dexie, { type EntityTable } from 'dexie'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { PreventivoInput, ArticoloWizard, ClienteSnapshot } from '@/types/preventivo'
import type { VanoMisurato } from '@/lib/rilievo'
import type { CommessaCompleta, CommessaInput, AccontoInput } from '@/types/commessa'

export interface PendingPreventivo {
  tempId?: number
  input: PreventivoInput
  createdAt: string
}

export interface BozzaWizard {
  id: string  // chiave fissa 'wizard-draft'
  clienteId: string | null
  snapshot: ClienteSnapshot
  numero: string
  articoli: ArticoloWizard[]
  scontoGlobale: number
  scontoImportoFisso: number | null
  mostraSconto: boolean
  note: string
  updatedAt: string
}

export interface RilievoSessione {
  id: string
  vani: VanoMisurato[]
  updatedAt: string
}

export interface VanoCanvasState {
  vanoId: string
  telai: Array<{ id: string; tipo: string; lati: string }>
  anteBattenti: Array<unknown>
  localInput: Record<string, number>
  updatedAt: string
}

export interface PendingCommessa {
  tempId?: number
  input: CommessaInput
  createdAt: string
}

export interface PendingAcconto {
  tempId?: number
  commessaId: string
  input: AccontoInput
  createdAt: string
}

class GestionaleDB extends Dexie {
  clienti!: EntityTable<Cliente, 'id'>
  listiniData!: EntityTable<CategoriaConListini, 'id'>
  pendingPreventivi!: EntityTable<PendingPreventivo, 'tempId'>
  rilievoSessione!: EntityTable<RilievoSessione, 'id'>
  vanoCanvas!: EntityTable<VanoCanvasState, 'vanoId'>
  bozzeWizard!: EntityTable<BozzaWizard, 'id'>
  commesse!: EntityTable<CommessaCompleta, 'id'>
  pendingCommesse!: EntityTable<PendingCommessa, 'tempId'>
  pendingAcconti!: EntityTable<PendingAcconto, 'tempId'>

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
    this.version(3).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
    })
    this.version(4).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
    })
  }
}

export const db = new GestionaleDB()
