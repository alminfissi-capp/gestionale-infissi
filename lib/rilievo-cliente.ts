// Cliente nuovo scritto in cantiere: dal testo cercato si propongono nome e cognome
// (prima parola nome, il resto cognome: "Anna De Luca"), poi si correggono nel modulo.
export function separaNome(testo: string): { nome: string; cognome: string } {
  const parole = testo.trim().split(/\s+/).filter(Boolean)
  if (parole.length < 2) return { nome: '', cognome: parole[0] ?? '' }
  return { nome: parole[0], cognome: parole.slice(1).join(' ') }
}
