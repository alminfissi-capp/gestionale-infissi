import type { VanoLeaf, VanoNode, VanoSplit, TipoRiempimento } from '@/types/rilievo-veloce'

type TipoApertura = 'battente' | 'scorrevole' | 'alzante_scorrevole' | null

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function makeLeaf(
  tipo_apertura: TipoApertura = null,
  n_ante: number = 1,
  apertura_ante: string[] = [],
  riempimento: TipoRiempimento = 'vetro',
): VanoLeaf {
  return { type: 'leaf', id: uid(), n_ante, tipo_apertura, apertura_ante, riempimento }
}

/**
 * Costruisce un albero vani da una griglia n_ante × (n_traverse + 1).
 * Le posizioni dei divisori sono in mm (relative al vano padre in cui vengono inserite).
 * - Montante: mm dal bordo sinistro del vano padre
 * - Traversa: mm dal bordo inferiore del vano padre
 */
export function makeGridTree(
  nAnte: number,
  nTraverse: number,
  tipoApertura: TipoApertura,
  aperturaAnte: string[],
  larghezzaMm: number,
  altezzaMm: number,
): VanoNode {
  const nRows = nTraverse + 1

  // Costruisce una colonna con nRows traverse uguali (dal basso verso l'alto)
  function buildRows(col: number, rowStart: number, count: number, hMm: number): VanoNode {
    if (count === 1) {
      const idx = col + rowStart * nAnte
      const ap = aperturaAnte[idx] ?? null
      return makeLeaf(tipoApertura, 1, ap ? [ap] : [], 'vetro')
    }
    const bottomMm = hMm / count            // altezza del vano più in basso
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione: 'traverso',
      mm: Math.round(bottomMm),             // mm dal basso del vano padre
      figli: [
        buildRows(col, rowStart, count - 1, hMm - bottomMm), // figlio0 = parte alta
        buildRows(col, rowStart + count - 1, 1, bottomMm),   // figlio1 = parte bassa
      ] as [VanoNode, VanoNode],
    }
    return split
  }

  // Costruisce le colonne con nAnte montanti uguali (da sinistra a destra)
  function buildCols(colStart: number, count: number, wMm: number): VanoNode {
    if (count === 1) return buildRows(colStart, 0, nRows, altezzaMm)
    const leftMm = wMm / count              // larghezza della colonna più a sinistra
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione: 'montante',
      mm: Math.round(leftMm),               // mm dal bordo sinistro del vano padre
      figli: [
        buildCols(colStart, 1, leftMm),           // figlio0 = parte sinistra
        buildCols(colStart + 1, count - 1, wMm - leftMm), // figlio1 = parte destra
      ] as [VanoNode, VanoNode],
    }
    return split
  }

  return buildCols(0, nAnte, larghezzaMm)
}

/** Aggiorna i campi di un nodo foglia per id */
export function updateLeaf(tree: VanoNode, id: string, patch: Partial<VanoLeaf>): VanoNode {
  if (tree.type === 'leaf') return tree.id === id ? { ...tree, ...patch } : tree
  return {
    ...tree,
    figli: [
      updateLeaf(tree.figli[0], id, patch),
      updateLeaf(tree.figli[1], id, patch),
    ] as [VanoNode, VanoNode],
  }
}

/** Aggiorna i mm di un VanoSplit per id */
export function updateSplit(tree: VanoNode, id: string, mm: number): VanoNode {
  if (tree.type === 'leaf') return tree
  if (tree.id === id) return { ...tree, mm }
  return {
    ...tree,
    figli: [
      updateSplit(tree.figli[0], id, mm),
      updateSplit(tree.figli[1], id, mm),
    ] as [VanoNode, VanoNode],
  }
}

/**
 * Aggiunge un divisore a un vano foglia.
 * - montante: il vano originale diventa figlio0 (sx), il nuovo diventa figlio1 (dx)
 * - traverso: il vano originale diventa figlio1 (basso), il nuovo diventa figlio0 (alto)
 */
export function addSplit(
  tree: VanoNode,
  leafId: string,
  direzione: 'montante' | 'traverso',
  mm: number,
): VanoNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    const nuovoVano = makeLeaf()
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione,
      mm,
      figli: direzione === 'montante'
        ? [tree, nuovoVano]          // originale = sx, nuovo = dx
        : [nuovoVano, tree],         // nuovo = alto, originale = basso
    }
    return split
  }
  return {
    ...tree,
    figli: [
      addSplit(tree.figli[0], leafId, direzione, mm),
      addSplit(tree.figli[1], leafId, direzione, mm),
    ] as [VanoNode, VanoNode],
  }
}

/**
 * Elimina un VanoSplit per id, sostituendolo con una foglia vuota.
 * Entrambi i figli del divisore vengono scartati.
 */
export function deleteSplit(tree: VanoNode, id: string): VanoNode {
  if (tree.type === 'leaf') return tree
  if (tree.id === id) return makeLeaf()
  return {
    ...tree,
    figli: [
      deleteSplit(tree.figli[0], id),
      deleteSplit(tree.figli[1], id),
    ] as [VanoNode, VanoNode],
  }
}

/** Cerca una foglia per id */
export function findLeaf(tree: VanoNode, id: string): VanoLeaf | null {
  if (tree.type === 'leaf') return tree.id === id ? tree : null
  return findLeaf(tree.figli[0], id) ?? findLeaf(tree.figli[1], id)
}

/** Restituisce tutte le foglie in ordine (left-to-right, top-to-bottom) */
export function getAllLeaves(tree: VanoNode): VanoLeaf[] {
  if (tree.type === 'leaf') return [tree]
  return [...getAllLeaves(tree.figli[0]), ...getAllLeaves(tree.figli[1])]
}

// ── Path dalla radice a una foglia ──────────────────────────────────────────

export interface PathStep {
  split: VanoSplit
  childIdx: 0 | 1
  parentW: number   // larghezza del vano padre (mm), per validare i mm del montante
  parentH: number   // altezza del vano padre (mm), per validare i mm della traversa
}

/**
 * Restituisce il percorso dalla radice alla foglia con id = targetId.
 * Ogni step include il VanoSplit attraversato, quale figlio porta alla foglia,
 * e le dimensioni (mm) del vano padre in quel punto.
 */
export function getPath(
  tree: VanoNode,
  targetId: string,
  wMm: number,
  hMm: number,
): PathStep[] | null {
  if (tree.type === 'leaf') return tree.id === targetId ? [] : null

  const [w0, h0] = tree.direzione === 'montante'
    ? [tree.mm, hMm]
    : [wMm, hMm - tree.mm]

  const [w1, h1] = tree.direzione === 'montante'
    ? [wMm - tree.mm, hMm]
    : [wMm, tree.mm]

  const path0 = getPath(tree.figli[0], targetId, w0, h0)
  if (path0 !== null) return [{ split: tree, childIdx: 0, parentW: wMm, parentH: hMm }, ...path0]

  const path1 = getPath(tree.figli[1], targetId, w1, h1)
  if (path1 !== null) return [{ split: tree, childIdx: 1, parentW: wMm, parentH: hMm }, ...path1]

  return null
}
