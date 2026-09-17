// Quale delle due ritenute ha senso su una commessa, e perche' l'altra no.
//
// Il tipo di cliente si cerca in anagrafica per nome, perche' la commessa salva
// solo il testo. Cliente fuori anagrafica = tipo ignoto = **entrambe
// disponibili**: meglio un caso da valutare a mano che una spunta sparita.

import { nomeCliente, trovaClientePerNome } from '@/lib/clienti-identita'
import type { Cliente } from '@/types/cliente'
import type { TipoRitenuta } from '@/lib/ritenuta-acconto'

/** Il motivo per cui una ritenuta non si applica, o `null` se si applica. */
export type MotiviRitenuta = Record<TipoRitenuta, string | null>

export function motiviRitenuta(
  clienti: Cliente[],
  clienteNome: string | null | undefined,
): MotiviRitenuta {
  const cliente = trovaClientePerNome(clienti, clienteNome)
  const nome = cliente ? nomeCliente(cliente) : ''

  return {
    // Le aziende non fanno la detrazione fiscale.
    detrazioni:
      cliente?.tipo === 'azienda'
        ? `${nome} e' un'azienda: la detrazione fiscale non si applica.`
        : null,
    // Il 4% lo trattiene chi e' sostituto d'imposta: un privato non lo e'.
    condominio:
      cliente?.tipo === 'privato'
        ? `${nome} e' un privato: non e' sostituto d'imposta e non trattiene il 4%.`
        : null,
  }
}
