// Script: importa il catalogo ESP Edilsider (SQLite) → anagrafica_prodotti su Supabase
// Usage: node scripts/import-catalogo-esp.mjs
// Richiede: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
//           DEFAULT_ORG_ID in .env.local (opzionale — usa la prima organization se assente)

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createRequire } from 'module'

config({ path: '.env.local' })

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const SQLITE_PATH = '/Users/gabrielebellante/Desktop/ESP backend/catalogo.db'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 500

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---- Recupera organization_id ----
async function getOrgId() {
  const envOrgId = process.env.DEFAULT_ORG_ID
  if (envOrgId) return envOrgId
  const { data, error } = await supabase.from('organizations').select('id').limit(1).single()
  if (error || !data) { console.error('Impossibile trovare organization_id:', error?.message); process.exit(1) }
  return data.id
}

// ---- Classificatori ----

const UM_MAP = {
  'ACC. PEZZO': 'pz',
  'MT': 'ml',
  'ML': 'ml',
  'GUARNIZIONE': 'pz',
  'BR': 'barre',
  'FL': 'ml',
  'PZ': 'pz',
  'MQ': 'm2',
  'ACC. METRO QUADRO': 'm2',
  'ACC. METRO LINEARE': 'ml',
  'KG': 'kg',
  'CP': 'cop',
}

const UM_VALIDE = new Set(['pz', 'ml', 'cop', 'kg', 'pacco', 'lt', 'm2', 'barre', 'kit'])

function mappaUm(umEsp) {
  const mapped = UM_MAP[umEsp?.trim()] ?? 'pz'
  return UM_VALIDE.has(mapped) ? mapped : 'pz'
}

function classificaTipologia(descrizione) {
  const d = descrizione.toUpperCase()
  if (/CERNIERA|CERN\.|2ERN\./.test(d)) return 'cerniere'
  if (/MANIGLIA|MANIG\.|POMOLO/.test(d)) return 'maniglie'
  if (/CREMON|CHIUSUR|NOTTOLINO/.test(d)) return 'chiusure'
  if (/CILINDRO|CIL\.|A POMPA/.test(d)) return 'cilindri'
  if (/GUARNIZION|GUARN\./.test(d)) return 'guarnizioni'
  if (/SQUADRET|SQUADR\./.test(d)) return 'squadrette'
  if (/SCORREVOL|BINARIO|ROTELL|CARRELLO/.test(d)) return 'scorrevoli'
  if (/TUBOLARE|TUB\.|PROFIL|BARRA|ANGOLARE/.test(d)) return 'profilati'
  if (/TAPPARELL|AVVOLGIBIL|SARACINESCA/.test(d)) return 'tapparelle'
  if (/\bVITE\b|BULLONE|RIVETTO|\bDADO\b|RONDELLA/.test(d)) return 'viteria'
  return 'accessori'
}

function classificaMateriale(descrizione, reparto) {
  const d = descrizione.toUpperCase()
  if (/INOX|INOSSIDABIL/.test(d)) return 'inox'
  if (/ALLUMINIO|ALLUM\.|ALLCO|ALCAN/.test(d)) return 'alluminio'
  if (/OTTONE|OTT\.|DORAT/.test(d)) return 'ottone'
  if (/NYLON|NAILON|PVC|PLASTICA/.test(d)) return 'nylon'
  if (/ZINCATO|GALVANIZ/.test(d)) return 'acciaio_zincato'
  if (reparto === 2 && /NERO|ACCIAIO|FERRO|S235|S355/.test(d)) return 'ferro'
  if (reparto === 2) return 'acciaio'
  return 'vari'
}

function parsePrezzo(prezzoStr) {
  if (!prezzoStr) return null
  const num = parseFloat(prezzoStr.replace(/[€\s]/g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

// ---- Trova o crea categorie magazzino per i 3 reparti ----
async function preparaCategorie(orgId) {
  const repartoCategoria = {
    1: { tipo: 'accessori', nome: 'Accessori Serramentistica (ESP)' },
    2: { tipo: 'ferro',     nome: 'Ferro e Acciaio (ESP)' },
    3: { tipo: 'accessori', nome: 'Cilindri e Serrature (ESP)' },
  }

  const ids = {}
  for (const [reparto, { tipo, nome }] of Object.entries(repartoCategoria)) {
    const { data: existing } = await supabase
      .from('categorie_magazzino')
      .select('id')
      .eq('organization_id', orgId)
      .eq('nome', nome)
      .maybeSingle()

    if (existing) {
      ids[reparto] = existing.id
    } else {
      const { data: created, error } = await supabase
        .from('categorie_magazzino')
        .insert({ organization_id: orgId, nome, tipo, ordine: 99 })
        .select('id')
        .single()
      if (error) { console.error(`Errore creazione categoria "${nome}":`, error.message); process.exit(1) }
      ids[reparto] = created.id
      console.log(`Creata categoria: ${nome}`)
    }
  }
  return ids
}

// ---- Main ----
async function main() {
  const orgId = await getOrgId()
  console.log(`Organization: ${orgId}`)

  const db = new Database(SQLITE_PATH, { readonly: true })

  const articoli = db.prepare(`
    SELECT
      a.codice, a.descrizione, a.um, a.reparto,
      p.prezzo, p.disponibile_al
    FROM articoli a
    LEFT JOIN prezzi p ON p.codice = a.codice
  `).all()

  console.log(`Letti ${articoli.length} articoli da SQLite`)

  const categorieIds = await preparaCategorie(orgId)

  const batch = articoli.map(r => ({
    organization_id: orgId,
    codice: r.codice,
    nome: (r.descrizione ?? '').slice(0, 200),
    descrizione: r.descrizione ?? '',
    unita_misura: mappaUm(r.um),
    prezzo_acquisto: parsePrezzo(r.prezzo),
    tipologia: classificaTipologia(r.descrizione ?? ''),
    materiale: classificaMateriale(r.descrizione ?? '', r.reparto),
    origine: 'esp',
    categoria_id: categorieIds[r.reparto] ?? null,
    soglia_abilitata: false,
  }))

  let importati = 0
  let errori = 0

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const slice = batch.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('anagrafica_prodotti')
      .upsert(slice, { onConflict: 'organization_id,codice' })

    if (error) {
      console.error(`\nErrore batch ${i}-${i + BATCH_SIZE}: ${error.message}`)
      errori += slice.length
    } else {
      importati += slice.length
      process.stdout.write(`\r${importati}/${batch.length} importati...`)
    }
  }

  db.close()
  console.log(`\nImportazione completata: ${importati} articoli, ${errori} errori.`)
}

main().catch(err => { console.error(err); process.exit(1) })
