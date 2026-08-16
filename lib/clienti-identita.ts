import { normalizzaTesto } from '@/lib/ricerca-clienti'

/**
 * Quando nel wizard si seleziona un cliente dall'anagrafica e poi se ne riscrivono
 * i dati sopra, il preventivo restava collegato al cliente sbagliato e la persona
 * nuova non entrava mai in anagrafica (il salvataggio crea il cliente solo se non
 * ce n'è uno selezionato). Qui si decide quando quel collegamento va sciolto.
 */

/** I campi che identificano *chi* è il cliente: cambiarli significa cambiare persona. */
export const CAMPI_IDENTITA = ['nome', 'cognome', 'ragione_sociale'] as const

export type CampoIdentita = (typeof CAMPI_IDENTITA)[number]

export type ClienteIdentita = {
  nome?: string | null
  cognome?: string | null
  ragione_sociale?: string | null
}

/**
 * `true` se il cliente collegato va scollegato perché il valore appena scritto
 * appartiene a un'altra persona.
 *
 * Un valore che è ancora un prefisso di quello attuale non scollega: serve a non
 * reagire mentre si svuota un campo per riscrivere lo stesso nome.
 */
export function deveScollegareCliente(
  clienteCollegato: ClienteIdentita | null | undefined,
  campo: string,
  nuovoValore: string | null
): boolean {
  if (!clienteCollegato) return false
  if (!(CAMPI_IDENTITA as readonly string[]).includes(campo)) return false

  const attuale = normalizzaTesto(clienteCollegato[campo as CampoIdentita] ?? '')
  const nuovo = normalizzaTesto(nuovoValore ?? '')

  if (nuovo === attuale) return false
  if (attuale.startsWith(nuovo)) return false // sta ancora digitando lo stesso valore

  return true
}
