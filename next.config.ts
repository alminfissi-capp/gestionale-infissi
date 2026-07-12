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
  // Upload buste/bonifici via Server Action: il default 1MB blocca i PDF scansionati (2-3MB).
  // (Vercel limita comunque il body delle function a ~4.5MB.)
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
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
