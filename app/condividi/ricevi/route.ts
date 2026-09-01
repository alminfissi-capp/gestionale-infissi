import { NextResponse } from 'next/server'

/**
 * Ripiego per quando il service worker non e' ancora attivo — capita nei primi
 * istanti dopo l'installazione della PWA, o subito dopo un aggiornamento.
 *
 * In quel caso il POST della condivisione arriva davvero qui invece di essere
 * intercettato. Non salviamo niente: rimandiamo alla pagina con un avviso, che
 * e' meglio del 405 secco che Next risponderebbe senza questo file, e che
 * Android mostrerebbe come una pagina di errore grezza.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.redirect(
    new URL('/condividi?errore=sw', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    303,
  )
}
