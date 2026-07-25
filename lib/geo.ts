export type LatLng = { lat: number; lng: number }

function valida(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Estrae coordinate lat/lng da testo libero o da un URL Google Maps.
 * Riconosce: coordinate nude ("lat, lng" o "lat lng"), @lat,lng,
 * q=/query=lat,lng, !3dLAT!4dLNG. Ritorna null se non trova coordinate valide
 * (inclusi i link accorciati maps.app.goo.gl, che non contengono coordinate).
 */
export function parseCoordinate(text: string): LatLng | null {
  const s = (text ?? '').trim()
  if (!s) return null

  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'

  // !3dLAT!4dLNG — pin del luogo, più preciso del centro mappa (@): controllato per primo
  const bang = s.match(new RegExp(`!3d${num}!4d${num}`))
  if (bang) return valida(parseFloat(bang[1]), parseFloat(bang[2]))

  // @lat,lng
  const at = s.match(new RegExp(`@${num},${num}`))
  if (at) return valida(parseFloat(at[1]), parseFloat(at[2]))

  // q=lat,lng oppure query=lat,lng
  const q = s.match(new RegExp(`[?&](?:q|query)=${num},${num}`))
  if (q) return valida(parseFloat(q[1]), parseFloat(q[2]))

  // coordinate nude: separatore virgola (con spazi opzionali) o solo spazi.
  // Escludo URL residui: se contiene 'http' e nessuno dei pattern sopra ha
  // fatto match, non è un formato di coordinate riconosciuto.
  if (!s.includes('http')) {
    const bare = s.match(new RegExp(`^${num}\\s*[, ]\\s*${num}$`))
    if (bare) return valida(parseFloat(bare[1]), parseFloat(bare[2]))
  }

  return null
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
