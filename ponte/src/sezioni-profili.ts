// Misure in vista dei profili lette dai loro DXF di FP PRO -> fp_profili_sezioni.
// La cartella DXF sta accanto a quella delle strutture (ARCHIVI_xxx\DXF, ARCHIVI_xxx\STR).
// In FP PRO il percorso del DXF nel database e' vuoto: il file e' DXF\<serie>\<codice>.DXF,
// quindi si scorre la cartella e si abbina per codice, preferendo la cartella della serie.
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'
import { sezioneDaDxf } from '../../lib/fppro/dxf-sezione.ts'
import { dxfInSvg } from '../../lib/fppro/dxf-svg.ts'
import type { RigaFp } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

export async function sezioniProfili(profili: RigaFp[], serie: RigaFp[], cartellaStrutture: string): Promise<RigaFp[]> {
  const cartellaDxf = join(dirname(cartellaStrutture.replace(/[\\/]+$/, '')), 'DXF')
  let file: string[]
  try {
    file = (await readdir(cartellaDxf, { recursive: true })).filter(f => f.toLowerCase().endsWith('.dxf'))
  } catch (e) {
    log(`Cartella DXF non leggibile ${cartellaDxf}: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
  const perCodice = new Map<string, string[]>()
  for (const f of file) {
    const codice = basename(f).replace(/\.dxf$/i, '').toUpperCase()
    perCodice.set(codice, [...(perCodice.get(codice) ?? []), f])
  }
  const nomeSerie = new Map(serie.map(s => [s.fp_id, String(s.nome ?? '').toUpperCase()]))

  const righe: RigaFp[] = []
  let senza = 0
  for (const p of profili) {
    const codice = String(p.codice ?? '').toUpperCase()
    const candidati = perCodice.get(codice) ?? []
    const cartella = nomeSerie.get(Number(p.serie_fp_id)) ?? ''
    const scelto = candidati.find(f => f.split(sep)[0].toUpperCase() === cartella) ?? candidati[0]
    if (!scelto) {
      senza++
      continue
    }
    try {
      const testo = new TextDecoder('windows-1252').decode(await readFile(join(cartellaDxf, scelto)))
      const s = sezioneDaDxf(testo)
      if (!s) {
        senza++
        continue
      }
      // Miniatura per gli elenchi del rilievo: facoltativa, non deve mai far perdere le misure.
      let anteprima: ReturnType<typeof dxfInSvg> = null
      try { anteprima = dxfInSvg(testo) } catch { anteprima = null }
      righe.push({ fp_id: p.fp_id, codice: p.codice, vista: s.vista, aletta: s.aletta, anteprima, dati: { file: scelto.split(sep).join('\\') } })
    } catch {
      senza++
    }
  }
  log(`Sezioni dei profili: ${righe.length} lette dai DXF, ${senza} senza disegno o senza misure`)
  return righe
}
