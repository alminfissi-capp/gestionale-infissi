import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Config a parte: la suite principale copre solo lib/**. Questa verifica
// renderizza un PDF vero, quindi vive fuori dal giro veloce dei test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['components/**/*.layout.test.tsx'],
    testTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
