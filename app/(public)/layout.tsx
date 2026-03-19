import type { Viewport } from 'next'
import '@/app/globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom abilitato: il cliente può ingrandire il preventivo con le dita
  maximumScale: 5,
  userScalable: true,
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, padding: 0, background: 'white' }}>
        {children}
      </body>
    </html>
  )
}
