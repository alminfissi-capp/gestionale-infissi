// Misure in vista dei profili lette dai loro DXF di FP PRO -> fp_profili_sezioni.
// La cartella DXF sta accanto a quella delle strutture (ARCHIVI_xxx\DXF, ARCHIVI_xxx\STR).
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { sezioneDaDxf } from '../../lib/fppro/dxf-sezione.ts'
import type { RigaFp } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

export async function sezioniProfili(profili: RigaFp[], cartellaStrutture: string): Promise<RigaFp[]> {
  const cartellaDxf = join(dirname(cartellaStrutture.replace(/[\/]+$/, '')), 'DXF')
  const righe: RigaFp[] = []
  let senza = 0
  for (const p of profili) {
    const file = typeof p.file_dxf === 'string' ? p.file_dxf : null
    if (!file) continue
    let testo: string
    try {
      testo = new TextDecoder('windows-1252').decode(await readFile(join(cartellaDxf, file)))
    } catch {
      senza++
      continue
    }
    const s = sezioneDaDxf(testo)
    if (!s) {
      senza++
      continue
    }
    righe.push({ fp_id: p.fp_id, codice: p.codice, vista: s.vista, aletta: s.aletta, dati: { file } })
  }
  log(`Sezioni dei profili: ${righe.length} lette dai DXF, ${senza} senza misure`)
  return righe
}
