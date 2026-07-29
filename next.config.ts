import type { NextConfig } from 'next'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'
import withSerwist from '@serwist/next'

// Copia il PDF.js worker in public/ ad ogni build/dev start
const workerSrc = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const workerDst = join(process.cwd(), 'public', 'pdf.worker.min.mjs')
if (existsSync(workerSrc) && !existsSync(workerDst)) {
  copyFileSync(workerSrc, workerDst)
}

const nextConfig: NextConfig = {
  // @react-pdf/renderer usa moduli nativi (fontkit, pdfkit) che webpack non può bundlare
  serverExternalPackages: ['@react-pdf/renderer', 'sharp'],
  // Upload via Server Action: il default 1MB blocca i PDF scansionati (2-3MB).
  // Resta comunque il tetto di Vercel sul corpo della richiesta (~4,5MB), che
  // questo valore non può alzare: i file grandi vanno caricati dal browser
  // direttamente su Supabase Storage (vedi DialogDocumenti/DialogPreventivoManuale).
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xawyrtqclpeylxnhwhwo.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
}

export default withSerwist({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})(nextConfig)
