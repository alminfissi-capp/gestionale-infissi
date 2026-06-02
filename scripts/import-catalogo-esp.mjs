// Script: importa il catalogo ESP Edilsider (SQLite catalogo.db) → catalogo_articoli su Supabase
// Usage: node scripts/import-catalogo-esp.mjs
// Richiede in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   DEFAULT_ORG_ID (opzionale — usa la prima organization se assente)
//   ESP_CATALOGO_DB_PATH (opzionale — default: ../ESP backend/catalogo.db)

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createRequire } from 'module'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: '.env.local' })

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const __dir = dirname(fileURLToPath(import.meta.url))
const SQLITE_PATH = process.env.ESP_CATALOGO_DB_PATH
  ?? resolve(__dir, '..', '..', 'ESP backend', 'catalogo.db')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE   = 500

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function getOrgId() {
  const envOrgId = process.env.DEFAULT_ORG_ID
  if (envOrgId) return envOrgId
  const { data, error } = await supabase.from('organizations').select('id').limit(1).single()
  if (error || !data) { console.error('Impossibile trovare organization_id:', error?.message); process.exit(1) }
  return data.id
}

async function main() {
  const orgId = await getOrgId()
  console.log(`Organization: ${orgId}`)
  console.log(`SQLite path:  ${SQLITE_PATH}`)

  const db = new Database(SQLITE_PATH, { readonly: true })

  // Leggi articoli con prezzi (JOIN LEFT — prezzi può essere vuota)
  const articoli = db.prepare(`
    SELECT
      a.codice, a.descrizione, a.um, a.reparto, a.gruppo, a.immagine_url,
      p.prezzo, p.disponibile_al, p.disponibile_ct, p.qty_al, p.qty_ct
    FROM articoli a
    LEFT JOIN prezzi p ON p.codice = a.codice
  `).all()

  db.close()
  console.log(`Letti ${articoli.length} articoli da SQLite`)

  // ── Import catalogo_articoli ────────────────────────────────────────────────
  const articoliBatch = articoli.map(r => ({
    organization_id:  orgId,
    codice:           r.codice,
    descrizione:      (r.descrizione ?? '').trim(),
    um:               (r.um ?? '').trim(),
    reparto:          r.reparto ?? null,
    gruppo:           r.gruppo ?? null,
    immagine_url:     r.immagine_url ?? null,
    soglia_abilitata: false,
  }))

  let importati = 0
  let errori    = 0

  for (let i = 0; i < articoliBatch.length; i += BATCH_SIZE) {
    const slice = articoliBatch.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('catalogo_articoli')
      .upsert(slice, { onConflict: 'organization_id,codice' })

    if (error) {
      console.error(`\nErrore articoli batch ${i}–${i + BATCH_SIZE}: ${error.message}`)
      errori += slice.length
    } else {
      importati += slice.length
      process.stdout.write(`\r  Articoli: ${importati}/${articoliBatch.length}...`)
    }
  }
  console.log(`\n  Articoli: ${importati} importati, ${errori} errori`)

  // ── Import catalogo_prezzi (solo righe con prezzo valorizzato) ──────────────
  const prezziRows = articoli
    .filter(r => r.prezzo !== null && r.prezzo !== undefined)
    .map(r => ({
      organization_id: orgId,
      codice:          r.codice,
      prezzo:          parseFloat((r.prezzo ?? '0').replace(/[€\s]/g, '').replace(',', '.')) || null,
      disponibile_al:  r.disponibile_al === 1,
      disponibile_ct:  r.disponibile_ct === 1,
      qty_al:          r.qty_al ?? 0,
      qty_ct:          r.qty_ct ?? 0,
    }))

  if (prezziRows.length > 0) {
    let importatiPrezzi = 0
    for (let i = 0; i < prezziRows.length; i += BATCH_SIZE) {
      const slice = prezziRows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('catalogo_prezzi')
        .upsert(slice, { onConflict: 'organization_id,codice' })
      if (error) {
        console.error(`\nErrore prezzi batch ${i}: ${error.message}`)
      } else {
        importatiPrezzi += slice.length
        process.stdout.write(`\r  Prezzi: ${importatiPrezzi}/${prezziRows.length}...`)
      }
    }
    console.log(`\n  Prezzi: ${importatiPrezzi} importati`)
  } else {
    console.log('  Prezzi: nessun prezzo presente in SQLite (tabella prezzi vuota)')
  }

  console.log('\nImportazione completata.')
}

main().catch(err => { console.error(err); process.exit(1) })
