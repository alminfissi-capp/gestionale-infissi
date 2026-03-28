/**
 * lib/formeStandard.ts
 * Forme serramento pre-configurate con regole geometriche.
 * Le misure "calcolato" derivano automaticamente da quelle "input".
 */

import type { FormaSerramentoInput, ShapeSegment, AngoloConfig } from '@/types/rilievo'
import type { TipoArco } from '@/types/rilievo'

// ---- helpers costruzione ----

function pt(id: string, gx: number, gy: number) {
  return { id, gx, gy }
}

function rettaSeg(
  id: string, fromId: string, toId: string,
  misuraNome: string,
  misuraTipo: 'input' | 'calcolato' = 'input',
  misuraFormula = ''
): ShapeSegment {
  return {
    id, fromId, toId,
    tipo: 'retta', cpDx: 0, cpDy: 0,
    misuraNome, misuraTipo, misuraFormula,
    sagittaNome: '', sagittaTipo: 'input', sagittaFormula: '',
  }
}

function arcoSeg(
  id: string, fromId: string, toId: string,
  tipoArco: TipoArco, cpDx: number, cpDy: number,
  cordaNome: string,
  sagittaNome: string, sagittaTipo: 'input' | 'calcolato', sagittaFormula: string,
  verticeAltNome?: string, verticeAltTipo?: 'input' | 'calcolato', verticeAltFormula?: string
): ShapeSegment {
  return {
    id, fromId, toId,
    tipo: 'arco', tipoArco, cpDx, cpDy,
    misuraNome: cordaNome, misuraTipo: 'input', misuraFormula: '',
    sagittaNome, sagittaTipo, sagittaFormula,
    ...(verticeAltNome ? { verticeAltNome, verticeAltTipo, verticeAltFormula } : {}),
  }
}

function angFisso(puntoId: string, gradi: number): AngoloConfig {
  return { puntoId, tipo: 'fisso', gradi }
}

function angAuto(puntoId: string): AngoloConfig {
  return { puntoId, tipo: 'automatico', gradi: null }
}

// ============================================================
// Forme standard
// ============================================================

export const FORME_STANDARD: FormaSerramentoInput[] = [

  // ── 1. Rettangolo ──────────────────────────────────────────
  // Input: Larghezza, Altezza
  {
    nome: 'Rettangolo',
    attiva: true,
    ordine: 0,
    shape: {
      chiusa: true,
      punti: [pt('p0',1,7), pt('p1',1,1), pt('p2',7,1), pt('p3',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        rettaSeg('s1','p1','p2','Larghezza'),
        rettaSeg('s2','p2','p3','Altezza'),       // stesso nome → deduplica
        rettaSeg('s3','p3','p0','Larghezza'),      // closing
      ],
      angoliConfig: [angFisso('p0',90), angFisso('p1',90), angFisso('p2',90), angFisso('p3',90)],
    },
  },

  // ── 2. Arco a Tutto Sesto ──────────────────────────────────
  // Input:    Larghezza, Altezza (montanti)
  // Calcolato: Freccia = Larghezza / 2
  // Info:      R = Larghezza / 2, H Vertice = Altezza + Larghezza / 2
  {
    nome: 'Arco a Tutto Sesto',
    attiva: true,
    ordine: 1,
    shape: {
      chiusa: true,
      // p0=BL, p1=TL(imposta sx), p2=TR(imposta dx), p3=BR
      punti: [pt('p0',1,7), pt('p1',1,4), pt('p2',7,4), pt('p3',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        // arc TL→TR: cpDy=-3 → bulge upward di 3 unità griglia (= metà corda da 6)
        arcoSeg('s1','p1','p2','tutto_sesto', 0, -3,
          'Larghezza',
          'Freccia', 'calcolato', 'Larghezza / 2',
          'Alt. Vertice', 'calcolato', 'Altezza + Larghezza / 2'),
        rettaSeg('s2','p2','p3','Altezza'),
        rettaSeg('s3','p3','p0','Larghezza'),      // closing
      ],
      angoliConfig: [angFisso('p0',90), angFisso('p1',90), angFisso('p2',90), angFisso('p3',90)],
    },
  },

  // ── 3. Arco a Sesto Ribassato ─────────────────────────────
  // Input:    Larghezza, Altezza (montanti), Freccia (= H Vertice − Altezza)
  // Info:     R = (Larghezza² + 4·Freccia²) / (8·Freccia)
  {
    nome: 'Arco a Sesto Ribassato',
    attiva: true,
    ordine: 2,
    shape: {
      chiusa: true,
      punti: [pt('p0',1,7), pt('p1',1,5), pt('p2',7,5), pt('p3',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        // arc piatto: cpDy=-0.9 (30% di metà corda 3→0.9)
        // Alt. Vertice = input; Freccia = calcolato = Alt. Vertice - Altezza
        arcoSeg('s1','p1','p2','ribassato', 0, -0.9,
          'Larghezza',
          'Freccia', 'calcolato', 'Alt. Vertice - Altezza',
          'Alt. Vertice', 'input', ''),
        rettaSeg('s2','p2','p3','Altezza'),
        rettaSeg('s3','p3','p0','Larghezza'),
      ],
      angoliConfig: [angFisso('p0',90), angFisso('p1',90), angFisso('p2',90), angFisso('p3',90)],
    },
  },

  // ── 4. Arco Rialzato ──────────────────────────────────────
  // Input:    Larghezza, Altezza (montanti), Freccia (> Larghezza/2)
  {
    nome: 'Arco Rialzato',
    attiva: true,
    ordine: 3,
    shape: {
      chiusa: true,
      punti: [pt('p0',1,7), pt('p1',1,5), pt('p2',7,5), pt('p3',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        // cpDy=-2.25 (75% di 3 = alto, quasi semicircolare)
        arcoSeg('s1','p1','p2','rialzato', 0, -2.25,
          'Larghezza',
          'Freccia', 'calcolato', 'Alt. Vertice - Altezza',
          'Alt. Vertice', 'input', ''),
        rettaSeg('s2','p2','p3','Altezza'),
        rettaSeg('s3','p3','p0','Larghezza'),
      ],
      angoliConfig: [angFisso('p0',90), angFisso('p1',90), angFisso('p2',90), angFisso('p3',90)],
    },
  },

  // ── 5. Arco Acuto / Gotico ────────────────────────────────
  // Input:    Larghezza, Altezza (montanti), Vertice (altezza apice sulla corda)
  // Info:     R = (Larghezza² + 4·Vertice²) / (4·Larghezza)
  {
    nome: 'Arco Acuto (Gotico)',
    attiva: true,
    ordine: 4,
    shape: {
      chiusa: true,
      punti: [pt('p0',1,7), pt('p1',1,5), pt('p2',7,5), pt('p3',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        // cpDy=-1.95 (65% di 3)
        arcoSeg('s1','p1','p2','acuto', 0, -1.95,
          'Larghezza',
          'Vertice', 'calcolato', 'Alt. Vertice - Altezza',
          'Alt. Vertice', 'input', ''),
        rettaSeg('s2','p2','p3','Altezza'),
        rettaSeg('s3','p3','p0','Larghezza'),
      ],
      angoliConfig: [angFisso('p0',90), angFisso('p1',90), angFisso('p2',90), angFisso('p3',90)],
    },
  },

  // ── 6. Triangolo Isoscele ─────────────────────────────────
  // Input:    Base, Lato (misura del lato obliquo — uguale per i due lati)
  // Angoli:   calcolati automaticamente dalla forma
  {
    nome: 'Triangolo Isoscele',
    attiva: true,
    ordine: 5,
    shape: {
      chiusa: true,
      // p0=BL, p1=BR, p2=APEX
      punti: [pt('p0',1,7), pt('p1',7,7), pt('p2',4,1)],
      segmenti: [
        rettaSeg('s0','p0','p1','Base'),
        rettaSeg('s1','p1','p2','Lato'),
        rettaSeg('s2','p2','p0','Lato'),           // stesso nome → deduplica (closing)
      ],
      angoliConfig: [angAuto('p0'), angAuto('p1'), angAuto('p2')],
    },
  },

  // ── 7. Triangolo Equilatero ───────────────────────────────
  // Input:    Lato (unico, tutti e tre i lati uguali)
  // Angoli:   tutti fissi a 60°
  {
    nome: 'Triangolo Equilatero',
    attiva: true,
    ordine: 6,
    shape: {
      chiusa: true,
      // APEX a (4,2) ≈ posizione equilatera su base 1→7 = 6 unità
      punti: [pt('p0',1,7), pt('p1',7,7), pt('p2',4,2)],
      segmenti: [
        rettaSeg('s0','p0','p1','Lato'),
        rettaSeg('s1','p1','p2','Lato'),           // deduplicato
        rettaSeg('s2','p2','p0','Lato'),           // deduplicato (closing)
      ],
      angoliConfig: [angFisso('p0',60), angFisso('p1',60), angFisso('p2',60)],
    },
  },

  // ── 8. Pentagono / Casa (simmetrico) ─────────────────────
  // Input:    Larghezza, Altezza (montanti), Falda (lunghezza falda — uguale sx e dx)
  // Angoli:   90° alla base, automatici al colmo e agli spigoli tetto
  {
    nome: 'Pentagono (Casa)',
    attiva: true,
    ordine: 7,
    shape: {
      chiusa: true,
      // p0=BL, p1=TL(ginocchio sx), p2=APEX(colmo), p3=TR(ginocchio dx), p4=BR
      punti: [pt('p0',1,7), pt('p1',1,4), pt('p2',4,1), pt('p3',7,4), pt('p4',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        rettaSeg('s1','p1','p2','Falda'),
        rettaSeg('s2','p2','p3','Falda'),          // stesso nome → deduplica (simmetrico)
        rettaSeg('s3','p3','p4','Altezza'),         // stesso nome → deduplica
        rettaSeg('s4','p4','p0','Larghezza'),       // closing
      ],
      angoliConfig: [
        angFisso('p0',90), angAuto('p1'), angAuto('p2'), angAuto('p3'), angFisso('p4',90),
      ],
    },
  },

  // ── 9. Pentagono / Casa (asimmetrico) ────────────────────
  // Input:    Larghezza, Altezza, Falda SX, Falda DX (indipendenti)
  {
    nome: 'Pentagono (Casa asimmetrica)',
    attiva: true,
    ordine: 8,
    shape: {
      chiusa: true,
      punti: [pt('p0',1,7), pt('p1',1,4), pt('p2',4,1), pt('p3',7,4), pt('p4',7,7)],
      segmenti: [
        rettaSeg('s0','p0','p1','Altezza'),
        rettaSeg('s1','p1','p2','Falda SX'),
        rettaSeg('s2','p2','p3','Falda DX'),
        rettaSeg('s3','p3','p4','Altezza'),
        rettaSeg('s4','p4','p0','Larghezza'),
      ],
      angoliConfig: [
        angFisso('p0',90), angAuto('p1'), angAuto('p2'), angAuto('p3'), angFisso('p4',90),
      ],
    },
  },
]
