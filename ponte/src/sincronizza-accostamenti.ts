// Accostamenti delle sezioni dalle commesse calcolate da FP PRO -> fp_accostamenti.
// FP PRO disegna ante e vetri accostando i DXF: nel file JOB di ogni voce calcolata scrive posizione
// e misura di ogni pezzo. Da li' si ricavano gli accostamenti (calcolo/accostamenti.ts) per struttura
// e profili; per ogni coppia vale la voce calcolata piu' recente.
// Si leggono soltanto i file di FP PRO. I file gia' letti stanno in una cache locale (data e dimensione):
// a ogni giro si aprono solo i jobrecord nuovi o cambiati.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml, type AccostamentoNodo } from '../../lib/fppro/strutture-xml.ts'
import { sezioneDaDxf, type SezioneProfilo } from '../../lib/fppro/dxf-sezione.ts'
import { larghezzeDaPoligoni } from '../../lib/fppro/calcolo/geometria.ts'
import { accostamentiDaCampione, accostamentiPlausibili, firmaProfili } from '../../lib/fppro/calcolo/accostamenti.ts'
import { aBlocchi } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

/** Si alza quando cambia il modo di ricavare gli accostamenti: la cache si butta e si rilegge tutto. */
const VERSIONE = 1
const PAGINA = 1000

interface Campione { nome: string; profili: string; nodi: Record<string, AccostamentoNodo> }
interface VoceCache { mtime: number; size: number; campione: Campione | null }
interface Cache { versione: number; file: Record<string, VoceCache> }

async function leggiCache(file: string): Promise<Cache> {
  try {
    const c = JSON.parse(await readFile(file, 'utf8')) as Cache
    if (c.versione === VERSIONE && c.file) return c
  } catch {
    // assente o rovinata: si rilegge tutto
  }
  return { versione: VERSIONE, file: {} }
}

/** Accostamenti di un jobrecord, o null se la voce non e' calcolata o non ha ante/vetri disegnati. */
export function campioneDaJobrecord(testo: string, parser: XMLParser, sezione: (dxf: string) => SezioneProfilo | null): Campione | null {
  if (!/<FP_JOBRECORD [^>]*Computed="1"/.test(testo)) return null
  const pulito = testo.replace(/<picture[^>]*>[\s\S]*?<\/picture>/g, '').replace(/<picture_alt_sight[^>]*>[\s\S]*?<\/picture_alt_sight>/g, '')
  const jr = (parser.parse(pulito) as { FP_JOBRECORD?: Record<string, unknown> }).FP_JOBRECORD
  if (!jr?.FP_TREE) return null
  const origine = String(jr.Str_Origine ?? '')
  const nome = origine.split(/[\\/]/).pop()?.replace(/\.str$/i, '') ?? ''
  const L = Number(jr.StyleL)
  const H = Number(jr.StyleH)
  if (!nome || !(L > 0) || !(H > 0)) return null
  const st = strutturaDaXml({ FP_TREE: jr.FP_TREE })
  const nodi = accostamentiDaCampione(st.albero, { L, H }, larghezzeDaPoligoni(st.poligoni), sezione)
  if (!accostamentiPlausibili(nodi)) return null
  return { nome, profili: firmaProfili(st.albero), nodi }
}

export async function sincronizzaAccostamenti(
  supabase: SupabaseClient,
  orgId: string,
  cartellaStrutture: string,
  fileCache: string,
): Promise<{ jobrecord: number; letti: number; campioni: number; scritti: number }> {
  const archivio = dirname(cartellaStrutture.replace(/[\\/]+$/, ''))
  const cartellaJob = join(archivio, 'JOB')
  const cartellaDxf = join(archivio, 'DXF')
  let voci: string[]
  try {
    voci = (await readdir(cartellaJob, { recursive: true })).filter(f => /_jobrecord_\d+\.xml$/i.test(f))
  } catch (e) {
    throw new Error(`Cartella JOB non leggibile ${cartellaJob}: ${e instanceof Error ? e.message : String(e)}`)
  }

  const cache = await leggiCache(fileCache)
  const nuova: Cache = { versione: VERSIONE, file: {} }
  const parser = new XMLParser(OPZIONI_XML)
  const decoder = new TextDecoder('windows-1252')
  const sezioni = new Map<string, SezioneProfilo | null>()
  const sezione = (dxf: string): SezioneProfilo | null => sezioni.get(dxf) ?? null
  // Le sezioni si leggono prima (async), poi il calcolo le usa in modo sincrono.
  const caricaSezioni = async (testo: string) => {
    for (const m of testo.matchAll(/DXF="([^"]+\.DXF)"/gi)) {
      const dxf = m[1]
      if (sezioni.has(dxf) || /^GLASSES[\\/]/i.test(dxf)) continue
      try {
        sezioni.set(dxf, sezioneDaDxf(decoder.decode(await readFile(join(cartellaDxf, dxf)))))
      } catch {
        sezioni.set(dxf, null)
      }
    }
  }

  // Per struttura e profili vince la voce calcolata piu' recente.
  const migliori = new Map<string, { campione: Campione; mtime: number; file: string }>()
  let letti = 0
  for (const voce of voci) {
    const percorso = voce.split(sep).join('/')
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(join(cartellaJob, voce))
    } catch {
      continue
    }
    let v = cache.file[percorso]
    if (!v || v.mtime !== info.mtimeMs || v.size !== info.size) {
      let campione: Campione | null = null
      try {
        const testo = decoder.decode(await readFile(join(cartellaJob, voce)))
        await caricaSezioni(testo)
        campione = campioneDaJobrecord(testo, parser, sezione)
      } catch (e) {
        log(`Commessa non leggibile per gli accostamenti ${percorso}: ${e instanceof Error ? e.message : String(e)}`)
      }
      v = { mtime: info.mtimeMs, size: info.size, campione }
      letti++
    }
    nuova.file[percorso] = v
    if (!v.campione) continue
    const chiave = `${v.campione.nome}|${v.campione.profili}`
    const prima = migliori.get(chiave)
    if (!prima || v.mtime > prima.mtime) migliori.set(chiave, { campione: v.campione, mtime: v.mtime, file: percorso })
  }

  // Si scrivono solo le righe nuove o cambiate; quelle senza piu' commessa restano ma non presenti.
  const esistenti = new Map<string, { id: string; nodi: unknown; origine: string | null; presente: boolean }>()
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase.from('fp_accostamenti').select('id, nome, profili, nodi, origine, presente')
      .eq('organization_id', orgId).order('id').range(da, da + PAGINA - 1)
    if (error) throw new Error(`fp_accostamenti: ${error.message}`)
    for (const r of data as { id: string; nome: string; profili: string; nodi: unknown; origine: string | null; presente: boolean }[]) {
      esistenti.set(`${r.nome}|${r.profili}`, r)
    }
    if (data.length < PAGINA) break
  }
  const ora = new Date().toISOString()
  const daScrivere = [...migliori.entries()]
    .filter(([k, m]) => {
      const e = esistenti.get(k)
      return !e || !e.presente || e.origine !== m.file || JSON.stringify(e.nodi) !== JSON.stringify(m.campione.nodi)
    })
    .map(([, m]) => ({
      organization_id: orgId, nome: m.campione.nome, profili: m.campione.profili, nodi: m.campione.nodi,
      origine: m.file, file_mtime: new Date(m.mtime).toISOString(), presente: true, sincronizzato_at: ora,
    }))
  for (const blocco of aBlocchi(daScrivere, 200)) {
    const { error } = await supabase.from('fp_accostamenti').upsert(blocco, { onConflict: 'organization_id,nome,profili' })
    if (error) throw new Error(`fp_accostamenti: ${error.message}`)
  }
  const assenti = [...esistenti.entries()].filter(([k, e]) => e.presente && !migliori.has(k)).map(([, e]) => e.id)
  for (const blocco of aBlocchi(assenti, 200)) {
    const { error } = await supabase.from('fp_accostamenti').update({ presente: false, sincronizzato_at: ora })
      .eq('organization_id', orgId).in('id', blocco)
    if (error) throw new Error(`fp_accostamenti: ${error.message}`)
  }

  await writeFile(fileCache, JSON.stringify(nuova))
  log(`Accostamenti: ${voci.length} voci di commessa (${letti} lette di nuovo), ${migliori.size} strutture con profili, ${daScrivere.length} scritte, ${assenti.length} non piu' presenti`)
  return { jobrecord: voci.length, letti, campioni: migliori.size, scritti: daScrivere.length }
}
