// ============================================================
// Geometria e calcolo distinta materiali per WinConfig
// Regola fondamentale fuori squadro: TRAPEZIO RETTANGOLO
//   - L costante (larghezza unica)
//   - I due montanti SEMPRE verticali
//   - Solo un lato orizzontale è inclinato
//   - lato_inclinazione: 'testa' | 'base'
// ============================================================

import type {
  ConfigWinConfig,
  DistintaWinConfig,
  FormaSerramento,
  LatoInclinazione,
  RigaDistintaAccessorio,
  RigaDistintaProfilo,
  RigaDistintaRiempimento,
  RegolaQty,
  WcAccessorio,
  WcColore,
  WcProfilo,
  WcRiempimento,
  WcSerie,
  TipoApertura,
} from '@/types/winconfig'

// ---- Geometria ----

/** Altezza del montante interno a quota X (0=sx, L=dx), interpolazione lineare */
export function altezzaMontanteInterno(
  x: number,
  L: number,
  Hsx: number,
  Hdx: number
): number {
  if (L === 0) return Hsx
  return Hsx + (Hdx - Hsx) * (x / L)
}

/** Area del trapezio rettangolo (= base × altezza_media) */
export function areaSerramento(L: number, Hsx: number, Hdx: number): number {
  return (L / 1000) * ((Hsx + Hdx) / 2 / 1000) // m²
}

/** Lunghezza diagonale dell'orizzontale inclinato */
export function lunghezzaOrizzontaleInclinato(
  L: number,
  Hsx: number,
  Hdx: number
): number {
  const deltaH = Math.abs(Hdx - Hsx)
  return Math.sqrt(L * L + deltaH * deltaH)
}

// ---- Calcolo quantità accessorio da regole range ----

export function calcolaQtyAccessorio(
  acc: WcAccessorio,
  L: number,
  Hmedia: number
): number {
  if (acc.qty_fissa !== null && acc.qty_fissa !== undefined) return acc.qty_fissa

  const regole: RegolaQty[] = Array.isArray(acc.regole_qty) ? acc.regole_qty : []
  for (const r of regole) {
    if (L <= r.larghezza_max && Hmedia <= r.altezza_max) return r.qty
  }
  // Nessuna regola applicabile → 1
  return 1
}

// ---- Calcolo prezzo colore ----

export function calcolaSovrapprezzo(
  colore: WcColore | null,
  prezzoBaseProfili: number,
  areaMq: number
): number {
  if (!colore || colore.valore_sovrapprezzo === 0) return 0
  switch (colore.tipo_sovrapprezzo) {
    case 'percentuale': return prezzoBaseProfili * (colore.valore_sovrapprezzo / 100)
    case 'mq':          return areaMq * colore.valore_sovrapprezzo
    case 'fisso':       return colore.valore_sovrapprezzo
  }
}

// ---- Costruzione distinta profili ----

/**
 * Determina quali profili usare in base al tipo apertura e struttura.
 * Semplificazione: un serramento = telaio fisso perimetrale + anta (se apribile).
 * I profili da usare vengono selezionati per tipo:
 *   telaio    → profilo perimetrale fisso (4 pezzi: base, testa, sx, dx)
 *   anta      → profilo anta apribile (4 pezzi se battente, proporzionale a n_ante)
 *   fermavetro → bordura vetro (perimetro anta)
 */
function calcolaDistintaProfili(
  profili: WcProfilo[],
  serie: WcSerie,
  forma: FormaSerramento,
  latoInclinazione: LatoInclinazione | null,
  L: number,
  Hsx: number,
  Hdx: number,
  tipoApertura: TipoApertura,
  nAnte: number
): RigaDistintaProfilo[] {
  const righe: RigaDistintaProfilo[] = []
  const Hmedia = (Hsx + Hdx) / 2
  const isFuoriSquadro = forma === 'fuori_squadro'
  const isInclinatoTesta = isFuoriSquadro && latoInclinazione === 'testa'
  const isInclinatoBase  = isFuoriSquadro && latoInclinazione === 'base'

  const sfrido_nodo   = serie.sfrido_nodo_mm
  const sfrido_angolo = serie.sfrido_angolo_mm

  const aggiungi = (
    profilo: WcProfilo,
    lunghezza: number,
    sfrido: number,
    n_pezzi: number,
    note: string
  ) => {
    const lt = lunghezza + sfrido
    const ml_totali = (lt / 1000) * n_pezzi
    righe.push({
      profilo_id: profilo.id,
      codice: profilo.codice,
      nome: profilo.nome,
      tipo: profilo.tipo,
      lunghezza_mm: Math.round(lunghezza),
      sfrido_mm: Math.round(sfrido),
      lunghezza_totale_mm: Math.round(lt),
      n_pezzi,
      ml_totali: parseFloat(ml_totali.toFixed(4)),
      prezzo_ml: profilo.prezzo_ml,
      prezzo_totale: parseFloat((ml_totali * profilo.prezzo_ml).toFixed(4)),
      costo_ml: profilo.prezzo_acquisto_ml,
      costo_totale: parseFloat((ml_totali * profilo.prezzo_acquisto_ml).toFixed(4)),
      note,
    })
  }

  // ---- TELAIO FISSO PERIMETRALE ----
  const profiloTelaio = profili.find(p => p.tipo === 'telaio')
  if (profiloTelaio) {
    // Montante SX (verticale, H_sx)
    aggiungi(profiloTelaio, Hsx, sfrido_nodo * 2, 1, 'Telaio montante SX')
    // Montante DX (verticale, H_dx)
    if (Hsx !== Hdx) {
      aggiungi(profiloTelaio, Hdx, sfrido_nodo * 2, 1, 'Telaio montante DX')
    } else {
      aggiungi(profiloTelaio, Hsx, sfrido_nodo * 2, 1, 'Telaio montante DX')
    }
    // Traversa DRITTO (orizzontale non inclinato)
    const sfridoTraversaDritta = sfrido_nodo * 2
    if (isFuoriSquadro) {
      // traversa dritto = lato opposto a quello inclinato
      const labelDritto = isInclinatoTesta ? 'Telaio traversa base (dritta)' : 'Telaio traversa testa (dritta)'
      aggiungi(profiloTelaio, L, sfridoTraversaDritta, 1, labelDritto)
      // traversa inclinato
      const sfridoTraversaInclinata = sfrido_nodo + sfrido_angolo
      const labelInclinato = isInclinatoTesta ? 'Telaio traversa testa (inclinata)' : 'Telaio traversa base (inclinata)'
      aggiungi(profiloTelaio, L, sfridoTraversaInclinata, 1, labelInclinato)
    } else {
      aggiungi(profiloTelaio, L, sfridoTraversaDritta, 1, 'Telaio traversa base')
      aggiungi(profiloTelaio, L, sfridoTraversaDritta, 1, 'Telaio traversa testa')
    }
  }

  // ---- ANTA (solo se non fisso) ----
  const profiloAnta = profili.find(p => p.tipo === 'anta')
  if (profiloAnta && tipoApertura !== 'fisso') {
    // Per ogni anta: larghezza_anta = L / n_ante (con sfrido per giochi)
    const LAanta = Math.round(L / nAnte) - 4 // 2mm gioco per lato
    const sfridoAnta = sfrido_nodo * 2
    for (let i = 0; i < nAnte; i++) {
      const Hanta_sx = isFuoriSquadro
        ? Math.round(altezzaMontanteInterno(i * (L / nAnte), L, Hsx, Hdx)) - 4
        : Hmedia - 4
      const Hanta_dx = isFuoriSquadro
        ? Math.round(altezzaMontanteInterno((i + 1) * (L / nAnte), L, Hsx, Hdx)) - 4
        : Hmedia - 4

      const labelBase = `Anta ${i + 1}`
      aggiungi(profiloAnta, LAanta, sfridoAnta, 1, `${labelBase} traversa base`)
      aggiungi(profiloAnta, LAanta, sfridoAnta, 1, `${labelBase} traversa testa`)
      aggiungi(profiloAnta, Hanta_sx, sfridoAnta, 1, `${labelBase} montante SX`)
      aggiungi(profiloAnta, Hanta_dx, sfridoAnta, 1, `${labelBase} montante DX`)
    }
  }

  // ---- FERMAVETRO / COPRIFILO ----
  const profiloFermavetro = profili.find(p => p.tipo === 'fermavetro')
  if (profiloFermavetro) {
    // Perimetro vetro approssimato = 2*(L + Hmedia) per ogni anta
    for (let i = 0; i < nAnte; i++) {
      const LAanta = Math.round(L / nAnte) - 10
      const Hanta = isFuoriSquadro
        ? Math.round(altezzaMontanteInterno((i + 0.5) * (L / nAnte), L, Hsx, Hdx)) - 10
        : Hmedia - 10
      const sfridoFv = sfrido_nodo * 2
      aggiungi(profiloFermavetro, LAanta, sfridoFv, 2, `Fermavetro anta ${i + 1} orizzontale`)
      aggiungi(profiloFermavetro, Hanta, sfridoFv, 2, `Fermavetro anta ${i + 1} verticale`)
    }
  }

  return righe
}

// ---- Costruzione distinta accessori ----

function calcolaDistintaAccessori(
  accessori: WcAccessorio[],
  L: number,
  Hmedia: number
): RigaDistintaAccessorio[] {
  return accessori.map(acc => {
    const qty = calcolaQtyAccessorio(acc, L, Hmedia)
    return {
      accessorio_id: acc.id,
      codice: acc.codice,
      nome: acc.nome,
      unita: acc.unita,
      qty,
      prezzo: acc.prezzo,
      prezzo_totale: parseFloat((acc.prezzo * qty).toFixed(4)),
      costo: acc.prezzo_acquisto,
      costo_totale: parseFloat((acc.prezzo_acquisto * qty).toFixed(4)),
    }
  })
}

// ---- Costruzione distinta riempimenti ----

function calcolaDistintaRiempimenti(
  riempimento: WcRiempimento | null,
  L: number,
  Hsx: number,
  Hdx: number,
  nAnte: number
): RigaDistintaRiempimento[] {
  if (!riempimento) return []

  // Area totale = area trapezio
  const area_mq = areaSerramento(L, Hsx, Hdx)
  const area_applicata_mq = Math.max(area_mq, riempimento.mq_minimo)

  return [{
    riempimento_id: riempimento.id,
    nome: riempimento.nome,
    tipo: riempimento.tipo,
    area_mq: parseFloat(area_mq.toFixed(4)),
    area_applicata_mq: parseFloat(area_applicata_mq.toFixed(4)),
    prezzo_mq: riempimento.prezzo_mq,
    prezzo_totale: parseFloat((area_applicata_mq * riempimento.prezzo_mq).toFixed(4)),
    costo_mq: riempimento.prezzo_acquisto_mq,
    costo_totale: parseFloat((area_applicata_mq * riempimento.prezzo_acquisto_mq).toFixed(4)),
  }]
}

// ---- Funzione principale ----

export type CalcoloInput = {
  serie: WcSerie
  profili: WcProfilo[]
  accessori: WcAccessorio[]
  riempimento: WcRiempimento | null
  colore: WcColore | null
  forma: FormaSerramento
  latoInclinazione: LatoInclinazione | null
  larghezza_mm: number
  altezza_sx_mm: number
  altezza_dx_mm: number
  tipoApertura: TipoApertura
  nAnte: number
}

export type CalcoloOutput = {
  distinta: DistintaWinConfig
  prezzo_profili: number
  prezzo_accessori: number
  prezzo_riempimenti: number
  prezzo_colore: number
  prezzo_totale: number
  costo_profili: number
  costo_accessori: number
  costo_riempimenti: number
  costo_totale: number
}

export function calcolaWinConfig(input: CalcoloInput): CalcoloOutput {
  const { serie, profili, accessori, riempimento, colore, forma,
    latoInclinazione, larghezza_mm: L, altezza_sx_mm: Hsx,
    altezza_dx_mm: Hdx, tipoApertura, nAnte } = input

  const Hmedia = (Hsx + Hdx) / 2
  const areaMq = areaSerramento(L, Hsx, Hdx)

  const distintaProfili = calcolaDistintaProfili(
    profili, serie, forma, latoInclinazione,
    L, Hsx, Hdx, tipoApertura, nAnte
  )
  const distintaAccessori = calcolaDistintaAccessori(accessori, L, Hmedia)
  const distintaRiempimenti = calcolaDistintaRiempimenti(riempimento, L, Hsx, Hdx, nAnte)

  const prezzo_profili = distintaProfili.reduce((s, r) => s + r.prezzo_totale, 0)
  const prezzo_accessori = distintaAccessori.reduce((s, r) => s + r.prezzo_totale, 0)
  const prezzo_riempimenti = distintaRiempimenti.reduce((s, r) => s + r.prezzo_totale, 0)
  const prezzo_colore = calcolaSovrapprezzo(colore, prezzo_profili, areaMq)

  const costo_profili = distintaProfili.reduce((s, r) => s + r.costo_totale, 0)
  const costo_accessori = distintaAccessori.reduce((s, r) => s + r.costo_totale, 0)
  const costo_riempimenti = distintaRiempimenti.reduce((s, r) => s + r.costo_totale, 0)

  const prezzo_totale = prezzo_profili + prezzo_accessori + prezzo_riempimenti + prezzo_colore
  const costo_totale = costo_profili + costo_accessori + costo_riempimenti

  return {
    distinta: {
      profili: distintaProfili,
      accessori: distintaAccessori,
      riempimenti: distintaRiempimenti,
    },
    prezzo_profili: parseFloat(prezzo_profili.toFixed(2)),
    prezzo_accessori: parseFloat(prezzo_accessori.toFixed(2)),
    prezzo_riempimenti: parseFloat(prezzo_riempimenti.toFixed(2)),
    prezzo_colore: parseFloat(prezzo_colore.toFixed(2)),
    prezzo_totale: parseFloat(prezzo_totale.toFixed(2)),
    costo_profili: parseFloat(costo_profili.toFixed(2)),
    costo_accessori: parseFloat(costo_accessori.toFixed(2)),
    costo_riempimenti: parseFloat(costo_riempimenti.toFixed(2)),
    costo_totale: parseFloat(costo_totale.toFixed(2)),
  }
}
