// Log giornaliero: <logDir>/ponte-YYYY-MM-DD.log, tenuti 30 giorni.
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

let cartella = ''

export function impostaLog(dir: string): void {
  cartella = dir
  mkdirSync(dir, { recursive: true })
  const limite = Date.now() - 30 * 24 * 60 * 60 * 1000
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (f.startsWith('ponte-') && statSync(p).mtimeMs < limite) unlinkSync(p)
  }
}

export function log(messaggio: string): void {
  const ora = new Date()
  const riga = `${ora.toISOString()} ${messaggio}`
  console.log(riga)
  if (!cartella) return
  try {
    appendFileSync(join(cartella, `ponte-${ora.toISOString().slice(0, 10)}.log`), riga + '\n')
  } catch {
    // il log non deve mai fermare il ponte
  }
}
