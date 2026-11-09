// Colore del serramento: di solito uno solo (stesso dentro e fuori); "Bicolore" quando
// interno ed esterno sono diversi. Nei dati restano sempre coloreInt e coloreEst.
import type { RifFp } from '@/types/rilievo-fp'

type Colore = RifFp | null | undefined

/** Bicolore = due colori diversi, oppure un lato solo indicato: cosi' si vede che all'altro manca */
export const eBicolore = (int: Colore, est: Colore): boolean => (!!int !== !!est) || (!!int && !!est && int.fpId !== est.fpId)

export const colori = (unico: RifFp | null): { coloreInt: RifFp | null; coloreEst: RifFp | null } => ({ coloreInt: unico, coloreEst: unico })

/** Da Bicolore a colore unico: vale l'interno (l'esterno se l'interno non c'e'), niente esterno vecchio nascosto */
export const toglieBicolore = (int: Colore, est: Colore) => colori(int ?? est ?? null)

type Coppia = { coloreInt?: Colore; coloreEst?: Colore }
const stesso = (a: Colore, b: Colore) => (a?.fpId ?? null) === (b?.fpId ?? null)
/** Stessi colori dentro e fuori: premere un pulsante senza cambiare niente non deve modificare la voce */
export const coloriUguali = (a: Coppia, b: Coppia) => stesso(a.coloreInt, b.coloreInt) && stesso(a.coloreEst, b.coloreEst)
