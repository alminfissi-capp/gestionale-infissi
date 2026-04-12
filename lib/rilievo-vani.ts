import type { VanoLeaf, VanoNode, VanoSplit, TipoRiempimento } from '@/types/rilievo-veloce'

type TipoApertura = 'battente' | 'scorrevole' | 'alzante_scorrevole' | 'fisso' | null

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function makeLeaf(
  tipo_apertura: TipoApertura = null,
  apertura: string | null = null,
  riempimento: TipoRiempimento = 'vetro',
): VanoLeaf {
  return { type: 'leaf', id: uid(), tipo_apertura, apertura, riempimento }
}

/**
 * Costruisce un albero vani da una griglia n_ante × (n_traverse + 1).
 * Le aperture sono prese da `aperturaAnte` (array flat row-major).
 */
export function makeGridTree(
  nAnte: number,
  nTraverse: number,
  tipoApertura: TipoApertura,
  aperturaAnte: string[],
): VanoNode {
  const nRows = nTraverse + 1

  function buildRows(col: number, rowStart: number, count: number): VanoNode {
    if (count === 1) {
      const idx = col + rowStart * nAnte
      return makeLeaf(tipoApertura, aperturaAnte[idx] ?? null)
    }
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione: 'traverso',
      frazione: 1 / count,
      figli: [
        buildRows(col, rowStart, 1),
        buildRows(col, rowStart + 1, count - 1),
      ] as [VanoNode, VanoNode],
    }
    return split
  }

  function buildCols(colStart: number, count: number): VanoNode {
    if (count === 1) return buildRows(colStart, 0, nRows)
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione: 'montante',
      frazione: 1 / count,
      figli: [
        buildCols(colStart, 1),
        buildCols(colStart + 1, count - 1),
      ] as [VanoNode, VanoNode],
    }
    return split
  }

  return buildCols(0, nAnte)
}

/** Aggiorna i campi di un nodo foglia identificato da `id` */
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

/** Divide un nodo foglia in due creando un VanoSplit */
export function splitLeaf(
  tree: VanoNode,
  id: string,
  direzione: 'montante' | 'traverso',
  frazione: number,
): VanoNode {
  if (tree.type === 'leaf') {
    if (tree.id !== id) return tree
    const right = makeLeaf(tree.tipo_apertura, tree.apertura, tree.riempimento)
    const split: VanoSplit = {
      type: 'split',
      id: uid(),
      direzione,
      frazione,
      figli: [tree, right],
    }
    return split
  }
  return {
    ...tree,
    figli: [
      splitLeaf(tree.figli[0], id, direzione, frazione),
      splitLeaf(tree.figli[1], id, direzione, frazione),
    ] as [VanoNode, VanoNode],
  }
}

/** Trova una foglia per id */
export function findLeaf(tree: VanoNode, id: string): VanoLeaf | null {
  if (tree.type === 'leaf') return tree.id === id ? tree : null
  return findLeaf(tree.figli[0], id) ?? findLeaf(tree.figli[1], id)
}

/** Restituisce tutte le foglie in ordine (left-to-right, top-to-bottom) */
export function getAllLeaves(tree: VanoNode): VanoLeaf[] {
  if (tree.type === 'leaf') return [tree]
  return [...getAllLeaves(tree.figli[0]), ...getAllLeaves(tree.figli[1])]
}
