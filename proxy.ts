import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh sessione (IMPORTANTE: non rimuovere)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Route pubbliche: accessibili senza autenticazione
  const PUBLIC_PREFIXES = ['/p/', '/o/', '/offline', '/api/track/', '/conferma/', '/api/firma-callback', '/api/avvia-firma', '/api/firma-pdf/']
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return supabaseResponse
  }

  // Reindirizza a /login se non autenticato
  if (!user && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Reindirizza a /preventivi se già autenticato e va a /login
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/preventivi'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Fuori dal controllo del login:
    // - sw.js (e i file del worker): Chrome rifiuta di installare o aggiornare un
    //   service worker il cui script arriva da un redirect;
    // - condividi/ricevi: il POST della condivisione da Android lo gestisce il
    //   service worker; se arriva al server deve trovare il ripiego, non il login.
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|swe-worker-.*\\.js|condividi/ricevi|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs|ico|webmanifest)$).*)',
  ],
}
