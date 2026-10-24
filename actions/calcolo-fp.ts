'use server'

// Calcolo dei rilievi con le strutture di FP PRO come lo fa FP PRO (fase 4a).
// Legge dal database solo le righe del listino che servono alle voci del rilievo,
// calcola con il motore puro di lib/fppro/calcolo e salva il risultato nel rilievo.
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { regoleDaElenchi, type RegoleAccessori, type RigaKitCatalogo } from '@/lib/fppro/calcolo/accessori'
import { listinoDaRighe, type RigheListino } from '@/lib/fppro/calcolo/listino'
import { clienteDelRilievo, motivoCalcoloSuperato, motivoVoceNonCalcolabile, noteTelaioTesto } from '@/lib/fppro/calcolo/trasferimento'
import { calcolaVoce, codiceDaDxf, type CalcoloVoce, type InputVoce, type ListinoCalcolo } from '@/lib/fppro/calcolo/voce'
import { fattoreBarreCommessa } from '@/lib/fppro/calcolo/commessa'
import type { CorrezioniVoce, OreVoce, PercentualiCalcolo, ProfiloCalcolo } from '@/lib/fppro/calcolo/tipi'
import { tempiConMinuti } from '@/lib/fppro/calcolo/correzioni'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import { createPreventivo } from '@/actions/preventivi'
import type { PreventivoInput } from '@/types/preventivo'
import type { RifFp, VoceFpDati } from '@/types/rilievo-fp'
import { coloriAccessori } from '@/lib/fppro/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface VoceCalcolata {
  voceId: string
  posizione: string
  quantita: number
  descrizione: string
  struttura: string
  strutturaId: string
  larghezza: number
  altezza: number
  immagine: string | null
  calcolo: CalcoloVoce
}

export interface CalcoloRilievo {
  configPrevFpId: number
  nomeProfilo: string
  voci: VoceCalcolata[]
  /** Voci non calcolabili (misure mancanti, struttura non trovata) */
  saltate: { voceId: string; posizione: string; motivo: string }[]
  totaleImponibile: number
  calcolatoAt: string
}

const messaggio = (e: unknown, riserva: string) => (e instanceof Error ? e.message : riserva)
const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v))
const BLOCCO = 150

/** Righe di una tabella con la colonna in una lista di valori, a blocchi e a pagine. */
async function inLista<T>(
  supabase: Supabase, orgId: string, tabella: string, colonne: string, colonna: string, valori: (string | number)[], ordine = 'fp_id',
): Promise<T[]> {
  const unici = [...new Set(valori)]
  const out: T[] = []
  for (let i = 0; i < unici.length; i += BLOCCO) {
    const blocco = unici.slice(i, i + BLOCCO)
    out.push(...await selectAll<T>((a, b) =>
      supabase.from(tabella).select(colonne).eq('organization_id', orgId).eq('presente', true).in(colonna, blocco)
        .order(ordine).range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>))
  }
  return out
}

const tuttiNodi = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tuttiNodi(n.figli)])

export interface ProfiloCalcoloFp {
  fpId: number
  nome: string
  /** Percentuali del profilo di FP PRO: i valori di partenza della finestra delle percentuali */
  percentuali: Required<PercentualiCalcolo>
}

export async function getProfiliCalcoloFp(): Promise<ProfiloCalcoloFp[] | { errore: string }> {
  await requireAccesso('rilievo')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data, error } = await supabase.from('fp_config_prev')
      .select('fp_id, nome, spese_generali, utile, provvigione, imballo, viaggio, materiali_vari, altro')
      .eq('organization_id', orgId).eq('presente', true).order('fp_id')
    if (error) throw new Error(error.message)
    return (data ?? []).map(r => ({
      fpId: r.fp_id as number,
      nome: r.nome as string,
      percentuali: {
        spese_generali: num(r.spese_generali), utile: num(r.utile), provvigione: num(r.provvigione), imballo: num(r.imballo),
        viaggio: num(r.viaggio), materiali_vari: num(r.materiali_vari), altro: num(r.altro),
      },
    }))
  } catch (e) {
    return { errore: messaggio(e, 'Profili di calcolo non disponibili') }
  }
}

interface RigaStruttura {
  id: string
  errore: string | null
  nome: string
  serie: string[]
  albero: NodoStruttura[]
  poligoni: number[][]
  tempi: OreVoce | null
  l_nominale: number | null
  h_nominale: number | null
  immagine: string | null
}

export async function calcolaRilievoFp(rilievoId: string, configPrevFpId: number): Promise<{ calcolo: CalcoloRilievo } | { errore: string }> {
  await requireAccesso('rilievo', 'scrittura')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: config, error: eConfig } = await supabase.from('fp_config_prev').select('*')
      .eq('organization_id', orgId).eq('fp_id', configPrevFpId).maybeSingle()
    if (eConfig) throw new Error(eConfig.message)
    if (!config) return { errore: 'Profilo di calcolo non trovato: sincronizza FP PRO' }
    const dati = (config.dati ?? {}) as Record<string, unknown>
    const profilo: ProfiloCalcolo = {
      spese_generali: num(config.spese_generali), utile: num(config.utile), provvigione: num(config.provvigione),
      costo_taglio: num(config.costo_taglio), costo_lavorazione: num(config.costo_lavorazione),
      costo_montaggio: num(config.costo_montaggio), costo_assemblaggio: num(config.costo_assemblaggio),
      costo_posa: num(config.costo_posa), imballo: num(config.imballo), viaggio: num(config.viaggio),
      materiali_vari: num(config.materiali_vari), altro: num(config.altro),
    }
    const maggiorazioni = { vetri: num(dati.maggrottvetri), pannelli: num(dati.maggrottpannelli) }

    // Percentuali comuni del rilievo: sopra quelle del profilo, sotto le correzioni della voce.
    const { data: rilievo, error: eRilievo } = await supabase.from('rilievi_veloci').select('percentuali_fp')
      .eq('organization_id', orgId).eq('id', rilievoId).maybeSingle()
    if (eRilievo) throw new Error(eRilievo.message)
    Object.assign(profilo, (rilievo?.percentuali_fp as PercentualiCalcolo | null) ?? {})

    const { data: voci, error: eVoci } = await supabase.from('rilievo_veloce_voci')
      .select('id, ordine, voce, quantita, fp, correzioni_fp').eq('organization_id', orgId).eq('rilievo_id', rilievoId)
      .not('fp', 'is', null).order('ordine')
    if (eVoci) throw new Error(eVoci.message)
    const righeVoci = (voci ?? []) as { id: string; ordine: number; voce: string | null; quantita: number; fp: VoceFpDati; correzioni_fp: CorrezioniVoce | null }[]

    const strutture = await inLista<RigaStruttura>(supabase, orgId, 'fp_strutture',
      'id, nome, serie, albero, poligoni, tempi, l_nominale, h_nominale, immagine, errore', 'id', righeVoci.map(v => v.fp.strutturaId), 'id')
    const perStruttura = new Map(strutture.map(s => [s.id, s]))

    // Codici che servono: profili (anche i telai scelti), accessori, vetri, pannelli, kit.
    const codiciProfili = new Set<string>()
    const codiciAccessori = new Set<string>()
    const codiciVetri = new Set<string>()
    const codiciPannelli = new Set<string>()
    const kit = new Set<string>()
    for (const s of strutture) {
      for (const n of tuttiNodi(s.albero)) {
        for (const p of n.pezzi) {
          const c = codiceDaDxf(p.dxf)
          if (p.tipo === 8510) codiciVetri.add(c)
          else if (p.tipo === 8500) codiciPannelli.add(c)
          else {
            codiciProfili.add(c)
            codiciProfili.add(c.replace(/[A-Z]+$/i, ''))
          }
        }
        n.accessori.forEach(a => codiciAccessori.add(a.codice))
        n.kit.forEach(k => { kit.add(k.codice); k.accessori.forEach(a => codiciAccessori.add(a.codice)) })
      }
    }
    for (const v of righeVoci) {
      Object.values(v.fp.telai ?? {}).forEach(c => c && codiciProfili.add(c))
      if (v.fp.anta) codiciProfili.add(v.fp.anta)
      Object.values(v.fp.vetri ?? {}).forEach(x => codiciVetri.add(x.codice))
      Object.values(v.fp.pannelli ?? {}).forEach(x => codiciPannelli.add(x.codice))
      ;(v.fp.accessoriAggiunti ?? []).forEach(a => codiciAccessori.add(a.codice))
    }

    const profili = await inLista<RigheListino['profili'][number]>(supabase, orgId, 'fp_profili', 'fp_id, codice, kg_ml, costo_kg, costo_ml', 'codice', [...codiciProfili])
    const componenti = await inLista<RigheListino['componenti'][number]>(supabase, orgId, 'fp_profili_componenti',
      'fp_id, composto_fp_id, componente_fp_id, principale, offset_mm', 'composto_fp_id', profili.map(p => p.fp_id))
    const mancanti = componenti.map(c => c.componente_fp_id).filter(id => !profili.some(p => p.fp_id === id))
    profili.push(...await inLista<RigheListino['profili'][number]>(supabase, orgId, 'fp_profili', 'fp_id, codice, kg_ml, costo_kg, costo_ml', 'fp_id', mancanti))
    const idProfili = profili.map(p => p.fp_id)
    const codiciTutti = profili.map(p => p.codice)

    const kitRighe = await inLista<{ fp_id: number; nome: string }>(supabase, orgId, 'fp_kit', 'fp_id, nome', 'nome', [...kit])
    const righeKit = await inLista<RigaKitCatalogo & { kit_fp_id: number }>(supabase, orgId, 'fp_kit_righe',
      'fp_id, kit_fp_id, codice, tipo, quantita, opzionale, dim_rif, lim_inf, lim_sup, passo, formula_r, formula_dist, dati', 'kit_fp_id', kitRighe.map(k => k.fp_id))
    const serieRighe = await inLista<{ riga_fp_id: number; serie: string }>(supabase, orgId, 'fp_kit_righe_serie', 'fp_id, riga_fp_id, serie', 'riga_fp_id', righeKit.map(r => r.fp_id))
    const nomeKit = new Map(kitRighe.map(k => [k.fp_id, k.nome]))
    const seriePerRiga = new Map<number, string[]>()
    serieRighe.forEach(s => seriePerRiga.set(s.riga_fp_id, [...(seriePerRiga.get(s.riga_fp_id) ?? []), s.serie]))
    const elencoRigheKit = righeKit.map(r => ({ kit: nomeKit.get(r.kit_fp_id) ?? '', codice: r.codice, serie: seriePerRiga.get(r.fp_id) ?? null }))
    // Righe dei kit scelti in cantiere che lo STR non contiene: i loro accessori vanno nel listino.
    const catalogoKit: Record<string, RigaKitCatalogo[]> = {}
    for (const r of righeKit) {
      const nome = nomeKit.get(r.kit_fp_id)
      if (nome) (catalogoKit[nome] ??= []).push(r)
    }
    righeKit.forEach(r => codiciAccessori.add(r.codice))

    const collegati = await inLista<{ codice_principale: string; codice_collegato: string; serie_collegato: string | null; quantita: number }>(
      supabase, orgId, 'fp_accessori_collegati', 'fp_id, codice_principale, codice_collegato, serie_collegato, quantita', 'codice_principale', [...codiciAccessori])
    collegati.forEach(c => codiciAccessori.add(c.codice_collegato))

    const righeListino: RigheListino = {
      profili,
      componenti,
      costi: await inLista(supabase, orgId, 'fp_profili_costi', 'fp_id, profilo_fp_id, colore_fp_id, costo_kg, costo_ml', 'profilo_fp_id', idProfili),
      barre: await inLista(supabase, orgId, 'fp_barre', 'fp_id, profilo_fp_id, lunghezza', 'profilo_fp_id', idProfili),
      scarti: await inLista(supabase, orgId, 'fp_scarti', 'fp_id, codice, testa, coda', 'codice', codiciTutti),
      sezioni: await inLista(supabase, orgId, 'fp_profili_sezioni', 'fp_id, codice, vista, aletta', 'codice', codiciTutti),
      accessori: await inLista(supabase, orgId, 'fp_accessori', 'fp_id, codice, serie, prezzo, unita_vendita', 'codice', [...codiciAccessori]),
      costiAccessori: [],
      vetri: await inLista(supabase, orgId, 'fp_vetri', 'fp_id, codice, prezzo_mq, min_fatt, kg_mq', 'codice', [...codiciVetri]),
      pannelli: await inLista(supabase, orgId, 'fp_pannelli', 'fp_id, codice, prezzo_mq, min_fatt', 'codice', [...codiciPannelli]),
    }

    // Prezzi per trattamento degli accessori: in FP PRO molti hanno 0 nel prezzo generale.
    righeListino.costiAccessori = await inLista(supabase, orgId, 'fp_accessori_costi',
      'fp_id, accessorio_fp_id, colore_fp_id, prezzo, unita_vendita', 'accessorio_fp_id', righeListino.accessori.map(a => a.fp_id))

    // Colori delle voci: prezzo al kg e tolleranza di peso del trattamento.
    const idColori = righeVoci.map(v => (v.fp.coloreEst ?? v.fp.coloreInt)?.fpId).filter((x): x is number => typeof x === 'number')
    const colori = await inLista<{ fp_id: number; dati: Record<string, unknown> | null }>(supabase, orgId, 'fp_colori', 'fp_id, dati', 'fp_id', idColori)
    const tolleranza = new Map(colori.map(c => [c.fp_id, num(c.dati?.tolleranza_peso)]))
    const listini = new Map<string, ReturnType<typeof listinoDaRighe>>()
    const listinoPer = (colore: number | null, coloriAcc: RifFp[]) => {
      const k = `${colore}|${coloriAcc.map(c => c.fpId).join(',')}`
      if (!listini.has(k)) {
        listini.set(k, listinoDaRighe(righeListino, colore === null ? null : { fpId: colore, tolleranzaPeso: tolleranza.get(colore) ?? 0 }, coloriAcc))
      }
      return listini.get(k)!
    }

    // Prima passata: ogni voce da sola, per avere i pezzi dei profili.
    const daCalcolare: { v: (typeof righeVoci)[number]; s: NonNullable<ReturnType<typeof perStruttura.get>>; input: InputVoce; listino: ListinoCalcolo; regole: RegoleAccessori }[] = []
    const saltate: CalcoloRilievo['saltate'] = []
    for (const v of righeVoci) {
      const posizione = v.voce ?? ''
      const s = perStruttura.get(v.fp.strutturaId)
      const motivo = motivoVoceNonCalcolabile(s, v.fp)
      if (motivo || !s || !v.fp.larghezza || !v.fp.altezza) { saltate.push({ voceId: v.id, posizione, motivo: motivo ?? 'Mancano le misure' }); continue }
      const regole = regoleDaElenchi(s.serie, elencoRigheKit,
        collegati.map(c => ({ principale: c.codice_principale, collegato: c.codice_collegato, quantita: num(c.quantita), serie: c.serie_collegato ?? '' })),
        catalogoKit)
      const colore = (v.fp.coloreEst ?? v.fp.coloreInt)?.fpId ?? null
      const input: InputVoce = {
        albero: s.albero, serie: s.serie, poligoni: s.poligoni,
        L: v.fp.larghezza, H: v.fp.altezza, L0: s.l_nominale ?? v.fp.larghezza, H0: s.h_nominale ?? v.fp.altezza,
        quote: v.fp.quote ?? {}, kitScelti: v.fp.kit ?? {}, accessoriScelti: v.fp.accessori ?? {},
        vetriScelti: Object.fromEntries(Object.entries(v.fp.vetri ?? {}).map(([k, x]) => [k, x.codice])),
        pannelliScelti: Object.fromEntries(Object.entries(v.fp.pannelli ?? {}).map(([k, x]) => [k, x.codice])),
        accessoriAggiunti: v.fp.accessoriAggiunti ?? [],
        telai: v.fp.telai, anta: v.fp.anta ?? undefined, tempi: tempiConMinuti(s.tempi ?? { taglio: 0, lavorazione: 0, montaggio: 0, assemblaggio: 0, posa: 0 }, v.fp.minuti),
        profilo, maggiorazioni, correzioni: v.correzioni_fp ?? undefined,
      }
      daCalcolare.push({ v, s, input, listino: listinoPer(colore, coloriAccessori(v.fp)), regole })
    }
    // Come FP PRO: le barre si ottimizzano su tutta la commessa e si ripartiscono sui pezzi.
    const { fattore } = fattoreBarreCommessa(daCalcolare.map(d => ({
      quantita: d.v.quantita || 1, tagli: calcolaVoce(d.input, d.listino, d.regole).tagli ?? [],
    })))

    const calcolate: VoceCalcolata[] = []
    for (const { v, s, input, listino, regole } of daCalcolare) {
      // I pezzi servivano solo al fattore: non si salvano.
      const calcolo = calcolaVoce({ ...input, fattoreBarre: fattore }, listino, regole)
      delete calcolo.tagli
      if (!s.tempi) calcolo.avvisi.push('Ore della struttura non lette: sincronizza FP PRO')
      calcolate.push({
        voceId: v.id, posizione: v.voce ?? '', quantita: v.quantita || 1, descrizione: `${v.fp.nome} ${v.fp.larghezza}x${v.fp.altezza}`,
        struttura: v.fp.nome, strutturaId: s.id, larghezza: input.L, altezza: input.H, immagine: s.immagine, calcolo,
      })
    }

    const risultato: CalcoloRilievo = {
      configPrevFpId, nomeProfilo: String(config.nome ?? ''), voci: calcolate, saltate,
      totaleImponibile: calcolate.reduce((t, v) => t + v.calcolo.prezzo.imponibile * v.quantita, 0),
      calcolatoAt: new Date().toISOString(),
    }
    const { error: eSalva } = await supabase.from('rilievi_veloci')
      .update({ config_prev_fp_id: configPrevFpId, calcolo: risultato }).eq('organization_id', orgId).eq('id', rilievoId)
    if (eSalva) throw new Error(eSalva.message)
    return { calcolo: risultato }
  } catch (e) {
    return { errore: messaggio(e, 'Calcolo non riuscito') }
  }
}

/**
 * Correzioni fatte a mano su una voce (ore, percentuali, extra): in una colonna propria,
 * cosi' l'invio dal telefono (che riscrive tutta la voce) non le cancella e loro non
 * cancellano le modifiche fatte in cantiere.
 */
export async function salvaCorrezioniVoce(voceId: string, correzioni: CorrezioniVoce): Promise<{ ok: true } | { errore: string }> {
  await requireAccesso('rilievo', 'scrittura')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const pulite: CorrezioniVoce = {
      ...(correzioni.ore && Object.keys(correzioni.ore).length > 0 ? { ore: correzioni.ore } : {}),
      ...(correzioni.percentuali && Object.keys(correzioni.percentuali).length > 0 ? { percentuali: correzioni.percentuali } : {}),
      ...(correzioni.extra && correzioni.extra.length > 0 ? { extra: correzioni.extra.filter(x => x.descrizione.trim() || x.importo) } : {}),
    }
    const vuote = Object.keys(pulite).length === 0
    const { data, error } = await supabase.from('rilievo_veloce_voci')
      .update({ correzioni_fp: vuote ? null : pulite, correzioni_fp_at: new Date().toISOString() })
      .eq('organization_id', orgId).eq('id', voceId).select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return { errore: 'Voce non trovata' }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Correzioni non salvate') }
  }
}

/**
 * Percentuali comuni del rilievo (finestra "Percentuali" del Calcolo). Valgono per tutte le
 * voci: si tolgono quelle scritte nelle singole voci (scelta dell'utente: salvare la finestra
 * sovrascrive sempre). Tutte le voci vengono segnate corrette adesso, cosi' il calcolo salvato
 * risulta superato e va rifatto prima del trasferimento.
 */
export async function salvaPercentualiRilievo(rilievoId: string, percentuali: PercentualiCalcolo): Promise<{ ok: true } | { errore: string }> {
  await requireAccesso('rilievo', 'scrittura')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const pulite = Object.fromEntries(Object.entries(percentuali).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))
    const { data, error } = await supabase.from('rilievi_veloci')
      .update({ percentuali_fp: Object.keys(pulite).length > 0 ? pulite : null })
      .eq('organization_id', orgId).eq('id', rilievoId).select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return { errore: 'Rilievo non trovato' }

    const { data: voci, error: eVoci } = await supabase.from('rilievo_veloce_voci').select('id, correzioni_fp')
      .eq('organization_id', orgId).eq('rilievo_id', rilievoId).not('fp', 'is', null)
    if (eVoci) throw new Error(eVoci.message)
    const ora = new Date().toISOString()
    for (const v of voci ?? []) {
      const c = (v.correzioni_fp as CorrezioniVoce | null) ?? null
      const senza: CorrezioniVoce | null = c ? { ...c } : null
      if (senza) delete senza.percentuali
      const vuote = !senza || Object.keys(senza).length === 0
      const { error: e } = await supabase.from('rilievo_veloce_voci')
        .update({ correzioni_fp: vuote ? null : senza, correzioni_fp_at: ora })
        .eq('organization_id', orgId).eq('id', v.id as string)
      if (e) throw new Error(e.message)
    }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Percentuali non salvate') }
  }
}

/**
 * Crea un preventivo nuovo dal calcolo del rilievo: una riga 'libera' per voce, uguale a
 * quelle importate dal PDF dei costi di FP PRO (immagine, descrizione con misure, note
 * tecniche, prezzo, costo materiali, costo lavorazione e posa) + config_fppro per la fase 5.
 */
export async function trasferisciInPreventivi(rilievoId: string): Promise<{ preventivoId: string; giaTrasferito: boolean } | { errore: string }> {
  await requireAccesso('rilievo')
  await requireAccesso('preventivi', 'scrittura')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data: rilievo, error } = await supabase.from('rilievi_veloci').select('id, cliente_snapshot, calcolo')
      .eq('organization_id', orgId).eq('id', rilievoId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!rilievo) return { errore: 'Rilievo non trovato' }
    const calcolo = rilievo.calcolo as CalcoloRilievo | null
    if (!calcolo || calcolo.voci.length === 0) return { errore: 'Calcola prima il rilievo' }

    const { data: gia } = await supabase.from('articoli_preventivo').select('preventivo_id')
      .eq('organization_id', orgId).eq('config_fppro->>rilievoId', rilievoId).limit(1)
    const giaTrasferito = (gia ?? []).length > 0

    const { data: voci, error: eVoci } = await supabase.from('rilievo_veloce_voci').select('id, fp, updated_at, correzioni_fp_at')
      .eq('organization_id', orgId).eq('rilievo_id', rilievoId).not('fp', 'is', null)
    if (eVoci) throw new Error(eVoci.message)
    const superato = motivoCalcoloSuperato(calcolo, (voci ?? []) as { id: string; updated_at: string; correzioni_fp_at: string | null }[])
    if (superato) return { errore: superato }
    const fpPerVoce = new Map((voci ?? []).map(v => [v.id as string, v.fp as VoceFpDati]))

    // Immagine della struttura copiata tra gli allegati dei preventivi (come l'import dal PDF).
    const immagini = new Map<string, string | null>()
    const copiaImmagine = async (path: string | null): Promise<string | null> => {
      if (!path) return null
      if (immagini.has(path)) return immagini.get(path)!
      let url: string | null = null
      try {
        const { data: file, error: eGiu } = await supabase.storage.from('fp-strutture').download(path)
        if (eGiu || !file) throw new Error(eGiu?.message ?? 'immagine non trovata')
        const destinazione = `${orgId}/fppro/${crypto.randomUUID()}.png`
        const { error: eSu } = await supabase.storage.from('preventivi-allegati').upload(destinazione, file, { contentType: 'image/png' })
        if (eSu) throw new Error(eSu.message)
        url = supabase.storage.from('preventivi-allegati').getPublicUrl(destinazione).data.publicUrl
      } catch (e) {
        // L'immagine e' un di piu': la riga si crea comunque.
        console.warn('[trasferisciInPreventivi] immagine non copiata:', messaggio(e, ''))
      }
      immagini.set(path, url)
      return url
    }

    const articoli: PreventivoInput['articoli'] = []
    for (const v of calcolo.voci) {
      const fp = fpPerVoce.get(v.voceId)
      const note = [
        v.posizione ? `Posizione: ${v.posizione}` : null,
        fp?.serie ? `Profili: ${fp.serie}` : null,
        fp?.coloreEst ? `Est.: ${fp.coloreEst.descrizione}` : null,
        fp?.coloreInt ? `Int.: ${fp.coloreInt.descrizione}` : null,
        fp && coloriAccessori(fp).length ? `Col. accessori: ${coloriAccessori(fp).map(c => c.descrizione).join(', ')}` : null,
        fp && Object.keys(fp.vetri ?? {}).length > 0 ? `Vetri: ${[...new Set(Object.values(fp.vetri).map(x => x.codice))].join(', ')}` : null,
        fp?.anta ? `Anta: ${fp.anta}` : null,
        noteTelaioTesto(fp?.noteTelaio),
      ].filter(Boolean).join('\n')
      const pu = Math.round(v.calcolo.prezzo.imponibile * 100) / 100
      articoli.push({
        tipo: 'libera', listino_id: null, listino_libero_id: null, prodotto_id: null, accessori_selezionati: null,
        accessori_griglia: null, tipologia: `${v.struttura} ${v.larghezza}x${v.altezza}`, categoria_nome: null,
        larghezza_mm: null, altezza_mm: null, larghezza_listino_mm: null, altezza_listino_mm: null, misura_arrotondata: false,
        finitura_nome: null, finitura_aumento: 0, finitura_aumento_euro: 0, note: note || null,
        immagine_url: await copiaImmagine(v.immagine), quantita: v.quantita, prezzo_base: null, prezzo_unitario: pu,
        sconto_articolo: 0, prezzo_totale_riga: pu * v.quantita,
        costo_acquisto_unitario: Math.round(v.calcolo.materiali * 100) / 100,
        costo_posa: Math.round(v.calcolo.prezzo.costoLavoro * 100) / 100,
        aliquota_iva: null, ordine: 0, bypass_calcolo: false, costo_prodotto_bypass: null, modalita_prezzo_bypass: null,
        percentuale_utile_bypass: null, omaggio: false,
        config_fppro: { rilievoId, voceId: v.voceId, configPrevFpId: calcolo.configPrevFpId, voce: fp ?? null, calcolo: v.calcolo },
      })
    }

    // Cliente: quello del preventivo gia' fatto da questo rilievo, poi l'anagrafica; altrimenti
    // createPreventivo lo registra (come il wizard quando non si sceglie un cliente).
    const cliente = rilievo.cliente_snapshot as ClienteSnapshotRilievo
    let clienteId: string | null = null
    if (giaTrasferito) {
      const { data: p } = await supabase.from('preventivi').select('cliente_id').eq('organization_id', orgId)
        .eq('id', (gia ?? [])[0].preventivo_id as string).maybeSingle()
      clienteId = (p?.cliente_id as string | null) ?? null
    }
    if (!clienteId) {
      const clienti = await selectAll<{ id: string; tipo: 'privato' | 'azienda' | null; ragione_sociale: string | null; nome: string | null; cognome: string | null; telefono: string | null }>((a, b) =>
        supabase.from('clienti').select('id, tipo, ragione_sociale, nome, cognome, telefono').eq('organization_id', orgId).order('id').range(a, b))
      clienteId = clienteDelRilievo(cliente, clienti)
    }
    // Il legame con l'anagrafica va in cliente_id, non nella fotografia del cliente.
    const clienteSnapshot = { ...cliente, cf_piva: null }
    delete clienteSnapshot.clienteId
    const { id } = await createPreventivo({
      clienteId,
      clienteSnapshot,
      numero: '',
      articoli,
      scontoGlobale: 0,
      scontoImportoFisso: null,
      mostraSconto: false,
      note: '',
    })
    return { preventivoId: id, giaTrasferito }
  } catch (e) {
    return { errore: messaggio(e, 'Trasferimento non riuscito') }
  }
}

export interface DatiPaginaCalcolo {
  cliente: ClienteSnapshotRilievo
  configPrevFpId: number | null
  calcolo: CalcoloRilievo | null
  profili: ProfiloCalcoloFp[]
  /** Percentuali comuni del rilievo (vuoto = profilo di calcolo) */
  percentualiRilievo: PercentualiCalcolo
  correzioni: Record<string, CorrezioniVoce>
  /** Perche' il calcolo salvato non e' piu' valido (voci cambiate dopo); null = valido */
  superato: string | null
  /** Preventivi gia' creati da questo rilievo */
  preventivi: { id: string; numero: string | null }[]
}

export async function getDatiCalcoloRilievo(rilievoId: string): Promise<DatiPaginaCalcolo | { errore: string }> {
  await requireAccesso('rilievo')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data: rilievo, error } = await supabase.from('rilievi_veloci').select('id, cliente_snapshot, config_prev_fp_id, calcolo, percentuali_fp')
      .eq('organization_id', orgId).eq('id', rilievoId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!rilievo) return { errore: 'Rilievo non trovato' }
    const profili = await getProfiliCalcoloFp()
    if ('errore' in profili) return profili
    const { data: voci } = await supabase.from('rilievo_veloce_voci').select('id, updated_at, correzioni_fp, correzioni_fp_at')
      .eq('organization_id', orgId).eq('rilievo_id', rilievoId).not('fp', 'is', null)
    const correzioni: Record<string, CorrezioniVoce> = {}
    for (const v of voci ?? []) if (v.correzioni_fp) correzioni[v.id as string] = v.correzioni_fp as CorrezioniVoce
    const calcolo = (rilievo.calcolo as CalcoloRilievo | null) ?? null
    const superato = calcolo ? motivoCalcoloSuperato(calcolo, (voci ?? []) as { id: string; updated_at: string; correzioni_fp_at: string | null }[]) : null
    const { data: righe } = await supabase.from('articoli_preventivo').select('preventivo_id')
      .eq('organization_id', orgId).eq('config_fppro->>rilievoId', rilievoId)
    const idPreventivi = [...new Set((righe ?? []).map(r => r.preventivo_id as string))]
    const { data: prev } = idPreventivi.length > 0
      ? await supabase.from('preventivi').select('id, numero').eq('organization_id', orgId).in('id', idPreventivi)
      : { data: [] }
    return {
      cliente: rilievo.cliente_snapshot as ClienteSnapshotRilievo,
      configPrevFpId: (rilievo.config_prev_fp_id as number | null) ?? null,
      calcolo,
      superato,
      profili,
      percentualiRilievo: (rilievo.percentuali_fp as PercentualiCalcolo | null) ?? {},
      correzioni,
      preventivi: (prev ?? []).map(p => ({ id: p.id as string, numero: (p.numero as string | null) ?? null })),
    }
  } catch (e) {
    return { errore: messaggio(e, 'Rilievo non disponibile') }
  }
}

export interface DatiRiepilogoServer {
  /** Prezzi dell'ultimo calcolo salvato (null = rilievo mai calcolato) */
  prezzi: { calcolatoAt: string; voci: Record<string, { unitario: number; superata: boolean }> } | null
  intestazione: { denominazione: string; logoUrl: string | null }
}

/**
 * Quello che il riepilogo stampabile del rilievo prende dal server (serve la rete):
 * prezzi dell'ultimo calcolo, con le voci cambiate o corrette dopo segnate superate, e
 * intestazione dell'azienda col logo.
 */
export async function getRiepilogoServer(rilievoId: string): Promise<DatiRiepilogoServer | { errore: string }> {
  await requireAccesso('rilievo')
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data: rilievo, error } = await supabase.from('rilievi_veloci').select('calcolo')
      .eq('organization_id', orgId).eq('id', rilievoId).maybeSingle()
    if (error) throw new Error(error.message)
    const calcolo = (rilievo?.calcolo as CalcoloRilievo | null) ?? null
    let prezzi: DatiRiepilogoServer['prezzi'] = null
    if (calcolo) {
      const { data: voci } = await supabase.from('rilievo_veloce_voci').select('id, updated_at, correzioni_fp_at')
        .eq('organization_id', orgId).eq('rilievo_id', rilievoId)
      const quando = new Map((voci ?? []).map(v => [v.id as string, v]))
      const t = (s: unknown) => (s ? new Date(String(s)).getTime() : 0)
      const calcolatoMs = new Date(calcolo.calcolatoAt).getTime()
      prezzi = {
        calcolatoAt: calcolo.calcolatoAt,
        voci: Object.fromEntries(calcolo.voci.map(v => {
          const q = quando.get(v.voceId)
          const superata = !q || t(q.updated_at) > calcolatoMs || t(q.correzioni_fp_at) > calcolatoMs
          return [v.voceId, { unitario: Math.round(v.calcolo.prezzo.imponibile * 100) / 100, superata }]
        })),
      }
    }
    const { data: imp } = await supabase.from('settings').select('denominazione, logo_url').eq('organization_id', orgId).maybeSingle()
    let logoUrl: string | null = null
    if (imp?.logo_url) {
      const { data } = await supabase.storage.from('logos').createSignedUrl(String(imp.logo_url), 3600)
      logoUrl = data?.signedUrl ?? null
    }
    return { prezzi, intestazione: { denominazione: String(imp?.denominazione ?? 'A.L.M. Infissi'), logoUrl } }
  } catch (e) {
    return { errore: messaggio(e, 'Riepilogo non disponibile') }
  }
}
