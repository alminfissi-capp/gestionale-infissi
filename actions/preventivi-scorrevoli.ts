'use server'

import fs from 'fs'
import path from 'path'
import type { PreventivoScorrevoli } from '@/types/scorrevoli'

const DIR = path.join(process.cwd(), 'data/scorrevoli/preventivi')

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
}

export async function listPreventiviScorrevoli(): Promise<PreventivoScorrevoli[]> {
  ensureDir()
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  return files
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf-8')) as PreventivoScorrevoli)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function getPreventivoScorrevoli(id: string): Promise<PreventivoScorrevoli | null> {
  ensureDir()
  const file = path.join(DIR, `${id}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export async function savePreventivoScorrevoli(
  data: Omit<PreventivoScorrevoli, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<PreventivoScorrevoli> {
  ensureDir()
  const now = new Date().toISOString()
  const existing = data.id ? await getPreventivoScorrevoli(data.id) : null
  const preventivo: PreventivoScorrevoli = {
    ...data,
    id: data.id ?? crypto.randomUUID(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  fs.writeFileSync(path.join(DIR, `${preventivo.id}.json`), JSON.stringify(preventivo, null, 2))
  return preventivo
}

export async function deletePreventivoScorrevoli(id: string): Promise<void> {
  const file = path.join(DIR, `${id}.json`)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export async function getNextNumero(): Promise<string> {
  ensureDir()
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  const anno = new Date().getFullYear()
  const numeri = files
    .map((f) => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf-8')) as PreventivoScorrevoli
        const match = p.numero?.match(/SC(\d+)\/(\d{4})/)
        if (match && parseInt(match[2]) === anno) return parseInt(match[1])
        return 0
      } catch { return 0 }
    })
  const max = numeri.length > 0 ? Math.max(...numeri) : 0
  return `SC${String(max + 1).padStart(3, '0')}/${anno}`
}
