import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DIMENSIONE_PARTE } from './conferme-ordine'

/*
 * Storage e tabelle finti, in memoria: quanto basta per seguire il
 * caricamento di riserva dal primo pezzo alla riga registrata sull'ordine.
 */
const TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ORG = '11111111-2222-3333-4444-555555555555'
const ORDINE = '99999999-8888-7777-6666-555555555555'

const oggetti = new Map<string, { dati: Uint8Array; mimetype: string }>()
const righe: Record<string, unknown>[] = []

function query(tabella: string) {
  let operazione: 'select' | 'insert' | 'delete' | 'update' = 'select'
  let head = false
  const risultato = () => {
    if (tabella === 'ordini_fornitore') {
      return {
        data: { id: ORDINE, organization_id: ORG, commessa_id: null, numero_ordine: '12', fornitore_id: null },
        error: null,
      }
    }
    if (tabella === 'file_fornitore_ordine') {
      if (head) return { count: righe.length, error: null }
      if (operazione === 'select') return { data: null, error: null }
    }
    return { data: null, error: null }
  }
  const builder: Record<string, unknown> = {
    select: (_: string, opz?: { head?: boolean }) => { head = Boolean(opz?.head); return builder },
    insert: (riga: Record<string, unknown>) => { operazione = 'insert'; righe.push(riga); return builder },
    delete: () => { operazione = 'delete'; return builder },
    update: () => { operazione = 'update'; return builder },
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(risultato()),
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(risultato()).then(ok, ko),
  }
  return builder
}

const storage = {
  upload: async (path: string, dati: ArrayBuffer, opz: { contentType: string; upsert?: boolean }) => {
    if (oggetti.has(path) && !opz.upsert) return { error: { message: 'esiste gia' } }
    oggetti.set(path, { dati: new Uint8Array(dati.slice(0)), mimetype: opz.contentType })
    return { error: null }
  },
  download: async (path: string) => {
    const o = oggetti.get(path)
    return o ? { data: new Blob([o.dati as BlobPart]), error: null } : { data: null, error: { message: 'manca' } }
  },
  remove: async (paths: string[]) => { paths.forEach((p) => oggetti.delete(p)); return { error: null } },
  list: async (cartella: string, opz: { search: string }) => ({
    data: [...oggetti.entries()]
      .filter(([p]) => p === `${cartella}/${opz.search}`)
      .map(([p, o]) => ({ name: p.slice(cartella.length + 1), metadata: { size: o.dati.byteLength, mimetype: o.mimetype } })),
    error: null,
  }),
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: query, storage: { from: () => storage } }),
}))

const { caricaParteDalServer } = await import('./conferme-ordine-db')

const impronta = (d: Uint8Array) => createHash('sha256').update(d).digest('hex')

/** PDF finto di `n` byte, con contenuto diverso a ogni posizione. */
const fileFinto = (n: number) => {
  const dati = new Uint8Array(n)
  for (let i = 0; i < n; i++) dati[i] = (i * 31 + 7) % 251
  return dati
}

async function caricaAPezzi(dati: Uint8Array, id = 'cccccccc-0000-0000-0000-000000000001') {
  const totale = Math.ceil(dati.byteLength / DIMENSIONE_PARTE)
  const esiti = []
  for (let parte = 0; parte < totale; parte++) {
    const pezzo = dati.slice(parte * DIMENSIONE_PARTE, (parte + 1) * DIMENSIONE_PARTE)
    esiti.push(await caricaParteDalServer(
      TOKEN, 'documento', 'Conferma grande.pdf', 'application/pdf', id, parte, totale, pezzo.buffer
    ))
  }
  return esiti
}

describe('caricaParteDalServer', () => {
  beforeEach(() => {
    oggetti.clear()
    righe.length = 0
  })

  it('ricompone un file da 18 MB arrivato in 6 pezzi, identico byte per byte', async () => {
    const originale = fileFinto(18 * 1024 * 1024)
    const esiti = await caricaAPezzi(originale)

    expect(esiti).toHaveLength(6)
    expect(esiti.slice(0, -1).every((e) => e.ok && !e.completato)).toBe(true)
    expect(esiti.at(-1)).toEqual({ ok: true, completato: true })

    const finali = [...oggetti.keys()]
    expect(finali).toHaveLength(1) // i pezzi temporanei sono stati tolti
    expect(finali[0]).toMatch(new RegExp(`^${ORG}/ordini/${ORDINE}/fornitore/\\d+-documento-Conferma_grande\\.pdf$`))
    expect(oggetti.get(finali[0])!.dati.byteLength).toBe(originale.byteLength)
    expect(impronta(oggetti.get(finali[0])!.dati)).toBe(impronta(originale))

    expect(righe).toHaveLength(1)
    expect(righe[0]).toMatchObject({ ordine_id: ORDINE, dimensione: originale.byteLength, content_type: 'application/pdf' })
  })

  it('un file piccolo passa in un pezzo solo, senza cartella temporanea', async () => {
    const originale = fileFinto(800 * 1024)
    const esiti = await caricaAPezzi(originale)
    expect(esiti).toEqual([{ ok: true, completato: true }])
    expect(oggetti.size).toBe(1)
    expect(righe).toHaveLength(1)
  })

  it('un pezzo rimandato due volte (rete che ritenta) non rompe il file', async () => {
    const originale = fileFinto(5 * 1024 * 1024)
    const id = 'cccccccc-0000-0000-0000-000000000002'
    const primo = originale.slice(0, DIMENSIONE_PARTE).buffer
    await caricaParteDalServer(TOKEN, 'documento', 'f.pdf', 'application/pdf', id, 0, 2, primo)
    await caricaParteDalServer(TOKEN, 'documento', 'f.pdf', 'application/pdf', id, 0, 2, primo)
    const ultimo = await caricaParteDalServer(
      TOKEN, 'documento', 'f.pdf', 'application/pdf', id, 1, 2, originale.slice(DIMENSIONE_PARTE).buffer
    )
    expect(ultimo).toEqual({ ok: true, completato: true })
    expect(oggetti.size).toBe(1)
    expect(impronta([...oggetti.values()][0].dati)).toBe(impronta(originale))
  })

  it("se manca un pezzo intermedio l'ultimo chiede di riprovare, senza registrare un file monco", async () => {
    const originale = fileFinto(5 * 1024 * 1024)
    const esito = await caricaParteDalServer(
      TOKEN, 'documento', 'f.pdf', 'application/pdf', 'cccccccc-0000-0000-0000-000000000003', 1, 2,
      originale.slice(DIMENSIONE_PARTE).buffer
    )
    expect(esito).toMatchObject({ ok: false, status: 409 })
    expect(righe).toHaveLength(0)
  })

  it('rifiuta pezzi oltre la dimensione massima o formati non ammessi', async () => {
    const troppo = new Uint8Array(DIMENSIONE_PARTE + 1).buffer
    expect(await caricaParteDalServer(TOKEN, 'documento', 'f.pdf', 'application/pdf', 'cccccccc-0000-0000-0000-000000000004', 0, 2, troppo))
      .toMatchObject({ ok: false, status: 400 })
    expect(await caricaParteDalServer(TOKEN, 'documento', 'f.exe', 'application/octet-stream', 'cccccccc-0000-0000-0000-000000000004', 0, 1, new Uint8Array(10).buffer))
      .toMatchObject({ ok: false, status: 400 })
    expect(oggetti.size).toBe(0)
  })
})
