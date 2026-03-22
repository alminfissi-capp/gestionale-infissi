import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgBuffer = readFileSync(join(root, 'public', 'favicon.svg'))

const sizes = [
  { size: 96,  out: 'favicon-96x96.png' },
  { size: 180, out: 'apple-touch-icon.png' },
  { size: 192, out: 'web-app-manifest-192x192.png' },
  { size: 512, out: 'web-app-manifest-512x512.png' },
]

for (const { size, out } of sizes) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', out))
  console.log(`Generated public/${out}`)
}
