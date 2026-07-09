// Parser client-side buste paga TeamSystem (cedolino «Mod. Cedolino TS»).
// Nessuna AI: legge il testo con coordinate (pdfjs) e usa ancore fisse del modulo.
// Gestisce sia il PDF di una singola busta sia il cedolino mensile completo
// (un dipendente per pagina + pagine F24/riepiloghi, che vengono ignorate).
import type { BustaEstratta } from '@/types/dipendente'
import { estraiItemsPagine, type PdfItem } from './pdf-items'

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
const CF_RE = /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/g

const parseNum = (s: string | undefined): number | null => {
  if (!s) return null
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}
const meseToNum = (nome: string) => String(MESI.indexOf(nome.toLowerCase()) + 1).padStart(2, '0')

/** Numero nella cella sotto una label del modulo (stessa colonna, riga subito sotto). */
function numeroSottoLabel(items: PdfItem[], label: string): number | null {
  const lab = items.find((i) => i.str === label)
  if (!lab) return null
  const cand = items
    .filter(
      (i) =>
        i.y < lab.y - 1 && i.y > lab.y - 32 &&
        i.x >= lab.x - 5 && i.x <= lab.x + 55 &&
        /^[\d.]*\d,\d{2}$/.test(i.str),
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)
  return cand.length ? parseNum(cand[0].str) : null
}

/** Estrae tutte le buste presenti nel PDF (una per pagina-cedolino). */
export async function parseBustePaga(file: File): Promise<BustaEstratta[]> {
  const pagine = await estraiItemsPagine(file)
  const risultati: BustaEstratta[] = []

  pagine.forEach((pg, idx) => {
    // È una busta solo se contiene l'etichetta "NETTO BUSTA"
    // (le pagine F24 e i riepiloghi hanno "NETTO IN BUSTA" o nulla).
    if (!pg.items.some((i) => i.str === 'NETTO BUSTA')) return
    const netto = numeroSottoLabel(pg.items, 'NETTO BUSTA')
    if (netto == null) return
    const lordo = numeroSottoLabel(pg.items, 'TOTALE LORDO')

    // Mese di competenza: nome mese + anno (es. "GIUGNO 2026")
    const mMese = pg.text.match(new RegExp(`(${MESI.join('|')})\\s+(\\d{4})`, 'i'))
    const periodo = mMese ? `${mMese[2]}-${meseToNum(mMese[1])}` : ''

    // Codice fiscale del dipendente: escludo quello dell'azienda ("Cod.fiscale : ...")
    const aziendaCf = pg.text.match(/Cod\.?\s*fiscale\s*:?\s*([A-Z0-9]{16})/i)?.[1]
    const cfs = [...pg.text.matchAll(CF_RE)].map((m) => m[1])
    const codice_fiscale = cfs.find((c) => c !== aziendaCf) ?? null

    // Nome/cognome: item multi-parola maiuscolo sulla stessa riga del mese ("TOIA CARLO")
    let cognome = ''
    let nome = ''
    const meseItem = pg.items.find((i) => new RegExp(`^(${MESI.join('|')})$`, 'i').test(i.str))
    const nameItem =
      meseItem &&
      pg.items.find(
        (i) =>
          Math.abs(i.y - meseItem.y) < 3 &&
          i.x > meseItem.x &&
          /^[A-ZÀ-Ù'’]{2,}(?:\s+[A-ZÀ-Ù'’]+)+$/.test(i.str),
      )
    if (nameItem) {
      const parts = nameItem.str.trim().split(/\s+/)
      cognome = parts[0] ?? ''
      nome = parts.slice(1).join(' ')
    }

    risultati.push({
      nome,
      cognome,
      codice_fiscale,
      periodo,
      mensilita: 'mensile', // la 13ª/14ª sono cedolini distinti: l'utente può correggere
      netto,
      lordo,
      pagina: idx + 1,
    })
  })

  return risultati
}
