import '@/app/globals.css'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, padding: 0, background: 'white' }}>
        {children}
      </body>
    </html>
  )
}
