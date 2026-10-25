import Dexie, { type EntityTable } from 'dexie'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { PreventivoInput, ArticoloWizard, ClienteSnapshot } from '@/types/preventivo'
import type { VanoMisurato } from '@/lib/rilievo'
import type { CommessaCompleta, CommessaInput, AccontoInput } from '@/types/commessa'
import type {
  ColoreLocale, EliminatoFp, ImmagineLocale, MetaFp, PreferenzaFp, RilievoLocale, SerieLocale,
  StrutturaLocale, SezioneLocale, TelaioLocale, VetroLocale, PannelloLocale, VoceLocale,
} from '@/types/rilievo-fp'
import type { EliminatoGrafico, RilievoGraficoLocale } from '@/types/rilievo-grafico'

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

/**
 * File arrivato dal foglio di condivisione di Android e non ancora smistato.
 * Ce n'e' al massimo uno: il service worker svuota la tabella prima di scrivere.
 */
export interface CondivisioneInArrivo {
  id?: number
  nome: string
  tipo: string
  blob: Blob
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
  condivisioni!: EntityTable<CondivisioneInArrivo, 'id'>
  fpStrutture!: EntityTable<StrutturaLocale, 'id'>
  fpImmagini!: EntityTable<ImmagineLocale, 'path'>
  fpColori!: EntityTable<ColoreLocale, 'fp_id'>
  fpVetri!: EntityTable<VetroLocale, 'fp_id'>
  fpPannelli!: EntityTable<PannelloLocale, 'fp_id'>
  fpTelai!: EntityTable<TelaioLocale, 'fp_id'>
  fpSezioni!: EntityTable<SezioneLocale, 'fp_id'>
  fpSerie!: EntityTable<SerieLocale, 'fp_id'>
  fpPreferenze!: EntityTable<PreferenzaFp, 'id'>
  fpMeta!: EntityTable<MetaFp, 'chiave'>
  rilieviFp!: EntityTable<RilievoLocale, 'id'>
  vociFp!: EntityTable<VoceLocale, 'id'>
  eliminatiFp!: EntityTable<EliminatoFp, 'id'>
  rilieviGrafici!: EntityTable<RilievoGraficoLocale, 'id'>
  eliminatiGrafici!: EntityTable<EliminatoGrafico, 'id'>

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
    this.version(5).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
    })
    // Fase 3: catalogo FP PRO nel telefono e rilievi che funzionano senza rete.
    this.version(6).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
    })
    this.version(7).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSezioni: 'fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
    })
      // Profili ora con gli utilizzi (telai e ante) e colori anche degli accessori: si
      // riscaricano da capo azzerando i cursori. Le righe vecchie NON si svuotano: senza
      // rete in cantiere gli elenchi resterebbero vuoti fino al prossimo download (le righe
      // senza utilizzi valgono come telai, i colori senza flag come colori dei profili).
      .upgrade(async tx => {
        await tx.table('fpMeta').bulkDelete(['cursore:fp_telai', 'cursore:fp_colori'])
      })
    // Rilievo grafico: serramenti fuori standard disegnati nel dispositivo.
    this.version(8).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSezioni: 'fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
      rilieviGrafici: 'id, aggiornatoAt, daInviare',
      eliminatiGrafici: 'id',
    })
    // Strutture con gli accessori opzionali dei kit e i tempi: si riscaricano. Si azzera solo
    // il cursore (come la v7): senza rete gli elenchi devono restare.
    this.version(9).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSezioni: 'fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
      rilieviGrafici: 'id, aggiornatoAt, daInviare',
      eliminatiGrafici: 'id',
    }).upgrade(async tx => {
      await tx.table('fpMeta').delete('cursore:fp_strutture')
    })
    // Pannelli di FP PRO, da mettere al posto dei vetri.
    this.version(10).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpPannelli: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSezioni: 'fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
      rilieviGrafici: 'id, aggiornatoAt, daInviare',
      eliminatiGrafici: 'id',
    })
    // Strutture con il gruppo di alternative dei kit (una sola scelta per gruppo): si riscaricano.
    this.version(11).stores({
      clienti: 'id, cognome, nome',
      listiniData: 'id, nome',
      pendingPreventivi: '++tempId, createdAt',
      rilievoSessione: 'id',
      vanoCanvas: 'vanoId',
      bozzeWizard: 'id, updatedAt',
      commesse: 'id, data_conferma, cliente_nome',
      pendingCommesse: '++tempId, createdAt',
      pendingAcconti: '++tempId, commessaId, createdAt',
      condivisioni: '++id, createdAt',
      fpStrutture: 'id, *serie, cartella, immagine',
      fpImmagini: 'path',
      fpColori: 'fp_id, descrizione',
      fpVetri: 'fp_id, codice',
      fpPannelli: 'fp_id, codice',
      fpTelai: 'fp_id, serie_fp_id, codice',
      fpSezioni: 'fp_id, codice',
      fpSerie: 'fp_id, nome',
      fpPreferenze: 'id, tipo',
      fpMeta: 'chiave',
      rilieviFp: 'id, aggiornatoAt, daInviare',
      vociFp: 'id, rilievoId, aggiornatoAt, daInviare',
      eliminatiFp: 'id',
      rilieviGrafici: 'id, aggiornatoAt, daInviare',
      eliminatiGrafici: 'id',
    }).upgrade(async tx => {
      await tx.table('fpMeta').delete('cursore:fp_strutture')
    })
  }
}

export const db = new GestionaleDB()
