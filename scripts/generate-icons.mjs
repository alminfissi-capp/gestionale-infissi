import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgBuffer = readFileSync(join(root, 'public', 'icon.svg'))

const sizes = [
  { size: 192, out: 'icon-192.png' },
  { size: 512, out: 'icon-512.png' },
]

for (const { size, out } of sizes) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', out))
  console.log(`Generated public/${out}`)
}
