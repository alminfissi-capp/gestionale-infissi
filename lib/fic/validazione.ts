/**
 * Controlla la data "Sincronizza dal". Oltre al formato rifiuta gli anni
 * implausibili: un campo data compilato da tastiera passa per 0002-01-01,
 * 0020-01-01... mentre si scrive l'anno, e salvare quei valori farebbe
 * scaricare l'intero archivio di Fatture in Cloud.
 */
export function erroreDataSincronizzaDal(data: string, oggi: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'Data non valida'
  if (data < '2000-01-01') return 'La data deve essere dal 2000 in poi'
  if (data > oggi) return 'La data non può essere nel futuro'
  return null
}

/** "Scarica fatture dal": la data si puo' solo anticipare, mai posticipare. */
export function erroreAnticipo(nuova: string, attuale: string, oggi: string): string | null {
  const base = erroreDataSincronizzaDal(nuova, oggi)
  if (base) return base
  if (nuova >= attuale) {
    const [a, m, g] = attuale.split('-')
    return `La nuova data deve essere precedente al ${g}/${m}/${a}`
  }
  return null
}
