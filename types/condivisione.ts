import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Un file arrivato dal foglio di condivisione di Android, in attesa di destinazione. */
export type FileCondiviso = {
  id: number
  nome: string
  tipo: string // MIME
  blob: Blob
  createdAt: string
}

export type PassiProps = {
  file: FileCondiviso
  /** Chiamata a salvataggio riuscito: l'imbuto cancella il file e chiude. */
  onFatto: () => void
  /** Torna al primo livello, la scelta dell'area. */
  onIndietro: () => void
}

/**
 * Un'area di destinazione dell'imbuto.
 *
 * Ogni area porta il proprio componente di passi invece di descriverli in un
 * linguaggio comune: Produzione cerca una commessa e sceglie un tipo, Dipendenti
 * sceglierebbe persona e mensilita', Magazzino un prodotto. Un motore generico
 * costerebbe piu' di quanto farebbe risparmiare, e andrebbe stretto alla prima
 * area che non ci rientra.
 */
export type AreaCondivisione = {
  id: string
  label: string
  descrizione: string
  icona: LucideIcon
  Passi: ComponentType<PassiProps>
}
