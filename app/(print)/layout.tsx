import '@/app/globals.css'

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, padding: 0, background: '#f3f4f6' }}>
        {children}
      </body>
    </html>
  )
}
