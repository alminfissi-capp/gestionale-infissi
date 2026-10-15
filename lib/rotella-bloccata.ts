import type { WheelEvent } from 'react'

/**
 * Rotella del mouse dentro finestre (Dialog) e tendine (Popover).
 *
 * Il blocco dello scorrimento di Radix (react-remove-scroll) scarta per intero
 * uno scatto di rotella quando l'elenco sotto il mouse ha meno spazio da
 * scorrere dello scatto stesso (~100 px su Windows): un elenco con poche righe
 * nascoste non si muove piu'. E una tendina aperta dentro una finestra viene
 * bloccata sempre, perche' sta fuori dal suo blocco.
 *
 * Qui si guarda a evento finito: se qualcuno ha annullato lo scatto, si scorre
 * a mano il primo contenitore scorrevole sotto il mouse che puo' ancora
 * muoversi, risalendo fino a `limite`. Se lo scatto non e' stato annullato lo
 * scorrimento l'ha fatto il browser, e non si tocca niente.
 */
export function recuperaRotella(e: WheelEvent<HTMLElement>) {
  const nativo = e.nativeEvent
  const limite = e.currentTarget
  const partenza = e.target as HTMLElement | null
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * limite.clientHeight : e.deltaY
  if (!dy) return
  // Il listener che annulla lo scatto e' registrato sul document dopo quello di
  // React: al momento di questo handler non ha ancora deciso.
  setTimeout(() => {
    if (!nativo.defaultPrevented) return
    for (let el = partenza; el; el = el === limite ? null : el.parentElement) {
      if (el.scrollHeight <= el.clientHeight) continue
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue
      const prima = el.scrollTop
      el.scrollTop = prima + dy
      if (el.scrollTop !== prima) return
    }
  }, 0)
}
