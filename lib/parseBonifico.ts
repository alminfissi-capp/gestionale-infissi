// Parser client-side contabili bonifico. Nessuna AI: solo testo + regex.
// Riconosce i due formati usati in azienda (SICILBANCA e Intesa Sanpaolo);
// il layout è a etichetta→valore, quindi i match testuali sono affidabili.
import type { BonificoEstratto } from '@/types/dipendente'
import { estraiItemsPagine } from './pdf-items'

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
const meseToNum = (nome: string) => String(MESI.indexOf(nome.toLowerCase()) + 1).padStart(2, '0')
const parseNum = (s: string | undefined): number | null => {
  if (!s) return null
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

export async function parseBonifico(file: File): Promise<BonificoEstratto> {
  const pagine = await estraiItemsPagine(file)
  const text = pagine.map((p) => p.text).join('\n')

  // IBAN del beneficiario (non quello dell'ordinante/conto di addebito)
  const iban_beneficiario =
    (text.match(/IBAN beneficiario\s*\n?\s*(IT\d{2}[A-Z0-9]{23})/i) ??
      text.match(/\bIBAN\b\s*\n?\s*(IT\d{2}[A-Z0-9]{23})/i))?.[1] ?? null

  // Nome del beneficiario (evito "Beneficiario effettivo")
  const beneficiario =
    text
      .match(/Beneficiario(?!\s+effettivo)\s*\n?\s*([A-ZÀ-Ù][A-Za-zÀ-ù'’ ]+?)\s*(?:\n|IBAN|Indirizzo)/)?.[1]
      ?.trim() ?? null

  // Importo: escludo "Totale operazione" e "Commissioni" (ancoro su "Importo ...")
  const importo = parseNum(text.match(/Importo\s*-?\s*([\d.]+,\d{2})\s*(?:€|Euro)/i)?.[1])

  // Data del pagamento (formati gg/mm/aaaa o gg.mm.aaaa a seconda della banca)
  const md =
    text.match(/Data esecuzione\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/Data addebito ordinante\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/Data regolamento beneficiario\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i) ??
    text.match(/autorizzato in data\s*(\d{2})[/.](\d{2})[/.](\d{4})/i)
  const data_pagamento = md ? `${md[3]}-${md[2]}-${md[1]}` : null

  // Causale → mese di competenza e mensilità
  const mCaus = text.match(
    new RegExp(`((?:Acconto|Saldo|Stipendio|Retribuzione)[^\\n]*?(${MESI.join('|')})\\s+(\\d{4}))`, 'i'),
  )
  const causale = mCaus?.[1]?.trim() ?? null
  const periodo_competenza = mCaus ? `${mCaus[3]}-${meseToNum(mCaus[2])}` : null
  const mensilita = /tredicesim|\b13/i.test(causale ?? '')
    ? 'tredicesima'
    : /quattordicesim|\b14/i.test(causale ?? '')
      ? 'quattordicesima'
      : 'mensile'

  return {
    beneficiario,
    iban_beneficiario,
    data_pagamento,
    importo,
    causale,
    periodo_competenza,
    mensilita,
  }
}
