// Strutture .STR di FP PRO -> fp_strutture + immagini PNG nel bucket fp-strutture.
// Rilegge solo i file cambiati (data e dimensione). Un file illeggibile si salva con
// `errore` e non ferma gli altri.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { PNG } from 'pngjs'
import { bmpInRgba } from '../../lib/fppro/bmp.ts'
import { OPZIONI_XML, strutturaDaXml } from '../../lib/fppro/strutture-xml.ts'
import { aBlocchi, verificaCartellaStrutture } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

const PAGINA = 1000
const BLOCCO_RIGHE = 25
const BUCKET = 'fp-strutture'

interface Esistente {
  percorso: string
  file_mtime: string
  file_size: number
  presente: boolean
  errore: string | null
}

async function leggiEsistenti(supabase: SupabaseClient, orgId: string): Promise<Map<string, Esistente>> {
  const mappa = new Map<string, Esistente>()
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase
      .from('fp_strutture').select('percorso, file_mtime, file_size, presente, errore')
      .eq('organization_id', orgId).order('percorso').range(da, da + PAGINA - 1)
    if (error) throw new Error(`fp_strutture: ${error.message}`)
    for (const r of data as Esistente[]) mappa.set(r.percorso, r)
    if (data.length < PAGINA) return mappa
  }
}

function pngDaBase64(b64: string): Buffer {
  const { larghezza, altezza, rgba } = bmpInRgba(new Uint8Array(Buffer.from(b64, 'base64')))
  const png = new PNG({ width: larghezza, height: altezza })
  png.data = Buffer.from(rgba)
  return PNG.sync.write(png)
}

export async function sincronizzaStrutture(
  supabase: SupabaseClient,
  orgId: string,
  cartella: string,
): Promise<{ lette: number; scritte: number; errori: number; assenti: number }> {
  let voci: string[] = []
  try {
    voci = (await readdir(cartella, { recursive: true })).filter(f => f.toLowerCase().endsWith('.str'))
  } catch {
    voci = []
  }
  const problema = verificaCartellaStrutture(cartella, voci.length)
  if (problema) throw new Error(problema)

  const esistenti = await leggiEsistenti(supabase, orgId)
  const parser = new XMLParser(OPZIONI_XML)
  const decoder = new TextDecoder('windows-1252')
  const ora = new Date().toISOString()
  const visti = new Set<string>()
  const daScrivere: Record<string, unknown>[] = []
  let errori = 0
  let scritte = 0

  for (const voce of voci) {
    const percorso = voce.split(sep).join('/')
    visti.add(percorso)
    const pieno = join(cartella, voce)
    const info = await stat(pieno)
    const mtime = info.mtime.toISOString()
    const prima = esistenti.get(percorso)
    // I file che avevano dato errore si rileggono sempre: sono pochi e il ponte puo' essere migliorato nel frattempo.
    if (prima && prima.presente && prima.errore === null && new Date(prima.file_mtime).toISOString() === mtime && Number(prima.file_size) === info.size) continue

    const nomeFile = percorso.slice(percorso.lastIndexOf('/') + 1).replace(/\.str$/i, '')
    const base = {
      organization_id: orgId,
      percorso,
      cartella: percorso.includes('/') ? percorso.slice(0, percorso.indexOf('/')) : '(radice)',
      nome: nomeFile,
      file_mtime: mtime,
      file_size: info.size,
      presente: true,
      sincronizzato_at: ora,
    }
    try {
      const testo = decoder.decode(await readFile(pieno))
      if (!testo.includes('<FP_TREE')) {
        throw new Error('formato vecchio di FP PRO (file binario, non XML): aprirlo e risalvarlo in FP PRO')
      }
      const s = strutturaDaXml(parser.parse(testo))
      // L'immagine e' un di piu': se non si converte, la struttura si salva lo stesso.
      let immagine: string | null = null
      if (s.immagineBase64) {
        const destinazione = `${orgId}/${createHash('sha1').update(percorso).digest('hex')}.png`
        try {
          const { error } = await supabase.storage.from(BUCKET)
            .upload(destinazione, pngDaBase64(s.immagineBase64), { contentType: 'image/png', upsert: true })
          if (error) throw new Error(error.message)
          immagine = destinazione
        } catch (e) {
          log(`Immagine non convertita ${percorso}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      daScrivere.push({
        ...base, codice: s.codice, descrizione: s.descrizione, serie: s.serie,
        l_nominale: s.lNominale, h_nominale: s.hNominale, albero: s.albero, poligoni: s.poligoni,
        immagine, errore: null,
      })
    } catch (e) {
      errori++
      const msg = e instanceof Error ? e.message : String(e)
      log(`Struttura non leggibile ${percorso}: ${msg}`)
      daScrivere.push({ ...base, codice: null, descrizione: null, serie: [], l_nominale: null, h_nominale: null, albero: [], poligoni: [], immagine: null, errore: msg })
    }

    scritte++
    if (daScrivere.length >= BLOCCO_RIGHE) await scrivi(supabase, daScrivere.splice(0))
  }
  await scrivi(supabase, daScrivere.splice(0))

  // Non si cancella: rilievi e preventivi della fase 3 punteranno a queste righe.
  const assenti = [...esistenti.values()].filter(e => e.presente && !visti.has(e.percorso)).map(e => e.percorso)
  for (const blocco of aBlocchi(assenti, 200)) {
    const { error } = await supabase.from('fp_strutture').update({ presente: false, sincronizzato_at: ora })
      .eq('organization_id', orgId).in('percorso', blocco)
    if (error) throw new Error(`fp_strutture: ${error.message}`)
  }

  log(`Strutture: ${voci.length} in FP PRO, ${scritte} lette di nuovo, ${errori} non leggibili, ${assenti.length} non piu' presenti`)
  return { lette: voci.length, scritte, errori, assenti: assenti.length }
}

async function scrivi(supabase: SupabaseClient, righe: Record<string, unknown>[]): Promise<void> {
  if (righe.length === 0) return
  const { error } = await supabase.from('fp_strutture').upsert(righe, { onConflict: 'organization_id,percorso' })
  if (error) throw new Error(`fp_strutture: ${error.message}`)
}
