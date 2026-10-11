/**
 * Misure in vista di un profilo lette dal suo DXF di FP PRO.
 *
 * I DXF di FP PRO hanno degli attributi (ATTDEF) con punti di riferimento:
 * VC_START e VC_END delimitano in y la parte in vista del profilo, FP_LCS_ORIG e' l'origine.
 * Verificato: TT8002 46,7 + aletta 22 (lista di taglio 2350 + 2 x 22), TT8011 78,
 * UP71878 51,5, UP71802 28.
 *
 * Lo usa il ponte sul PC (Node senza build): niente import.
 */

export interface SezioneProfilo {
  /** Larghezza in vista (mm) */
  vista: number
  /** Parte esterna oltre la vista (mm), es. l'aletta dei telai a Z: allunga i tagli */
  aletta: number
}

const tondo = (v: number) => Math.round(v * 100) / 100

export function sezioneDaDxf(testo: string): SezioneProfilo | null {
  const righe = testo.replace(/\r/g, '').split('\n')
  const punti = new Map<string, number>()
  let inAttdef = false
  let y: number | null = null
  let tag: string | null = null
  const chiudi = () => {
    if (inAttdef && tag !== null && y !== null && !punti.has(tag)) punti.set(tag, y)
  }
  for (let i = 0; i + 1 < righe.length; i += 2) {
    const codice = righe[i].trim()
    const valore = righe[i + 1].trim()
    if (codice === '0') {
      chiudi()
      inAttdef = valore === 'ATTDEF'
      y = null
      tag = null
      continue
    }
    if (!inAttdef) continue
    if (codice === '20') y = Number(valore)
    if (codice === '2') tag = valore
  }
  chiudi()
  const a = punti.get('VC_START')
  const b = punti.get('VC_END')
  if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const vista = tondo(Math.abs(a - b))
  if (vista <= 0) return null
  const origine = punti.get('FP_LCS_ORIG')
  const aletta = origine === undefined ? 0 : tondo(Math.max(0, Math.min(a, b) - origine))
  return { vista, aletta }
}
