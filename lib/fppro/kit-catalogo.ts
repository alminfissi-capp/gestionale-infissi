// Kit del catalogo di FP PRO cercati per nome come li scrive lo STR. I nomi possono differire
// per maiuscole (STR "F2-DK-DX", catalogo "F2-dk-dx") e lo stesso nome puo' stare in piu' gruppi
// kit (POOLFILE 34/35/36): vale quello con il gruppo di alternative, poi il primo.
export const chiaveKit = (nome: string): string => nome.trim().toUpperCase()

export interface RigaKitNome {
  fp_id: number
  nome: string
  /** raggruppamentoid (gruppo di alternative); null = senza gruppo */
  gruppo: number | null
}

export function kitPerNome<T extends RigaKitNome>(righe: T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const r of [...righe].sort((a, b) => a.fp_id - b.fp_id)) {
    const k = chiaveKit(r.nome)
    const prima = out.get(k)
    if (!prima || (prima.gruppo === null && r.gruppo !== null)) out.set(k, r)
  }
  return out
}

/** Gruppo dai dati del kit: 0 o vuoto = senza gruppo */
export const gruppoDaDati = (dati: Record<string, unknown> | null | undefined): number | null => {
  const g = Number(dati?.raggruppamentoid ?? 0)
  return Number.isFinite(g) && g > 0 ? g : null
}
