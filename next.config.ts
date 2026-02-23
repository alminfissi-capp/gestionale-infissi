import type { NextConfig } from 'next'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

// Copia il PDF.js worker in public/ ad ogni build/dev start
const workerSrc = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const workerDst = join(process.cwd(), 'public', 'pdf.worker.min.mjs')
if (existsSync(workerSrc) && !existsSync(workerDst)) {
  copyFileSync(workerSrc, workerDst)
}

const nextConfig: NextConfig = {
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

export default nextConfig
