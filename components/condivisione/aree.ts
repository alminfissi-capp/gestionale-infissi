import { Factory } from 'lucide-react'
import AreaProduzione from './AreaProduzione'
import type { AreaCondivisione } from '@/types/condivisione'

/**
 * Le aree dell'imbuto. Aggiungerne una domani vuol dire scrivere il suo
 * componente di passi e metterlo qui: nient'altro cambia.
 *
 * Si mostrano solo le aree che funzionano davvero. Un elenco con Commesse,
 * Dipendenti e Magazzino in grigio orienterebbe meno di uno con una voce sola.
 */
export const AREE: AreaCondivisione[] = [
  {
    id: 'produzione',
    label: 'Produzione',
    descrizione: 'Disegni, schede tecniche, DDT e foto di una commessa',
    icona: Factory,
    Passi: AreaProduzione,
  },
]
