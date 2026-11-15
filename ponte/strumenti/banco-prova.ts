// Banco di prova: ricalcola con il motore di WinStudio le commesse gia' calcolate da FP PRO
// e confronta gli accessori (codici e quantita') e il loro costo, voce per voce.
// FP PRO si legge soltanto (MySQL in sessione READ ONLY, file JOB letti e mai scritti).
//
// Uso (dalla radice del progetto):
//   npx vite-node ponte/strumenti/banco-prova.ts [filtro nome commessa]
// Risultati in C:\WinStudioPonte\banco (fuori da FP_PRO e dal repository: contengono clienti).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { apriDbSolaLettura } from '../src/mysql-sola-lettura'
import { OPZIONI_XML, strutturaDaXml } from '../../lib/fppro/strutture-xml'
import { sezioneDaDxf } from '../../lib/fppro/dxf-sezione'
import { calcolaVoce, codiceDaDxf, type InputVoce, type ListinoCalcolo } from '../../lib/fppro/calcolo/voce'
import { regoleDaElenchi, type RigaKitCatalogo } from '../../lib/fppro/calcolo/accessori'
import { LARGHEZZE_PREDEFINITE, pezziECampi } from '../../lib/fppro/calcolo/geometria'
import { confrontaAccessori, type ConfrontoAccessori } from '../../lib/fppro/calcolo/confronto-fp'
import { datiFissaggi } from '../../lib/fppro/calcolo/fissaggi'
import { accostamentiDaCampione, applicaAccostamenti } from '../../lib/fppro/calcolo/accostamenti'
import { larghezzeDaPoligoni } from '../../lib/fppro/calcolo/geometria'
import type { AccostamentoNodo } from '../../lib/fppro/strutture-xml'
import type { ProfiloCalcolo } from '../../lib/fppro/calcolo/tipi'

process.loadEnvFile(process.env.PONTE_ENV ?? 'C:\\WinStudioPonte\\.env')
const filtro = process.argv[2] ?? ''
const ARCHIVIO = 'C:\\FP_PRO\\ARCHIVI_EDILSIDER_NEW'
const USCITA = 'C:\\WinStudioPonte\\banco'

const db = await apriDbSolaLettura({
  host: process.env.FP_MYSQL_HOST, port: Number(process.env.FP_MYSQL_PORT), user: process.env.FP_MYSQL_USER,
  password: process.env.FP_MYSQL_PASSWORD, database: process.env.FP_MYSQL_DATABASE,
})
type Riga = Record<string, unknown>
const q = async (sql: string, p: unknown[] = []) => (await db.leggi(sql, p)) as Riga[]
const n = (v: unknown) => Number(v ?? 0) || 0
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const inLista = async (sql: string, valori: unknown[]) => (valori.length === 0 ? [] : q(sql, [valori]))

// Percentuali non contano qui: si confrontano materiali; profilo neutro.
const PROFILO: ProfiloCalcolo = {
  spese_generali: 0, utile: 0, provvigione: 0, costo_taglio: 0, costo_lavorazione: 0, costo_montaggio: 0,
  costo_assemblaggio: 0, costo_posa: 0, imballo: 0, viaggio: 0, materiali_vari: 0, altro: 0,
}

interface EsitoVoce {
  commessa: string
  voce: number
  struttura: string
  mano: string | null
  pezzi: number
  costoAccFp: number
  costoAccWs: number
  scartoAcc: number
  /** Profili: non confrontati (sempre 0). Vetri: mÂ² WS - FP per pezzo */
  scartoProf: number
  scartoVet: number
  /** Scarto stimato sul prezzo dovuto agli accessori: accessori x ricarico FP della voce */
  scartoPrezzo: number
  confronto: ConfrontoAccessori
  avvisi: string[]
  errore?: string
}

const leggiXml = (file: string) => new XMLParser(OPZIONI_XML).parse(
  new TextDecoder('windows-1252').decode(readFileSync(file))
    .replace(/<picture[^>]*>[\s\S]*?<\/picture>/g, '').replace(/<picture_alt_sight[^>]*>[\s\S]*?<\/picture_alt_sight>/g, ''),
) as { FP_JOBRECORD: Riga & { FP_TREE: unknown } }

/** Mano usata da FP PRO: le righe con Apertura confermate dicono il lato. */
function manoDa(xml: string): 'sx' | 'dx' | null {
  let dx = 0
  let sx = 0
  for (const m of xml.matchAll(/<FP_FITTING [^>]*>/g)) {
    const a = /Apertura="(\d)"/.exec(m[0])?.[1]
    if (!a || !/Confirmed="1"/.test(m[0])) continue
    if (a === '1') dx++
    if (a === '2') sx++
  }
  return dx > sx ? 'dx' : sx > dx ? 'sx' : null
}

const sezioni = new Map<string, { vista: number; aletta: number } | null>()
function sezione(dxf: string) {
  if (!sezioni.has(dxf)) {
    try {
      const sez = sezioneDaDxf(new TextDecoder('windows-1252').decode(readFileSync(join(ARCHIVIO, 'DXF', dxf))))
      sezioni.set(dxf, sez ? { vista: sez.vista, aletta: sez.aletta } : null)
    } catch {
      sezioni.set(dxf, null)
    }
  }
  return sezioni.get(dxf) ?? null
}

// Accostamenti di FP PRO (ACCOSTAMENTI=1): per ogni struttura una voce campione (un'altra voce)
// (la prima trovata) da cui si leggono gli accostamenti; si verificano sulle altre voci.
const ACCOSTAMENTI = process.env.ACCOSTAMENTI === '1'
const campioni = new Map<string, { commessa: string; voce: number; acc: Record<string, AccostamentoNodo> }>()
let usatiAccostamenti = 0

// Chiave del campione: struttura + profili usati (vetri e pannelli esclusi): un telaio diverso sposta le ante
// (02-MOND_FIN2A_ZOCC: ES2352 -7,6 mm, ES2350 +12,35 mm).
const profiliDi = (nodi: ReturnType<typeof strutturaDaXml>['albero']): string[] =>
  nodi.flatMap(nd => [...nd.pezzi.filter(p => p.tipo !== 8510 && p.tipo !== 8500).map(p => codiceDaDxf(p.dxf)), ...profiliDi(nd.figli)])

function campioneDi(nomeCommessa: string, nv: number, nomeStruttura: string, albero: ReturnType<typeof strutturaDaXml>, L: number, H: number) {
  const struttura = `${nomeStruttura}|${[...new Set(profiliDi(albero.albero))].sort().join(',')}`
  const c = campioni.get(struttura)
  if (c) return c.commessa === nomeCommessa && c.voce === nv ? null : c
  const acc = accostamentiDaCampione(albero.albero, { L, H }, larghezzeDaPoligoni(albero.poligoni), d => sezione(d))
  campioni.set(struttura, { commessa: nomeCommessa, voce: nv, acc })
  return null
}

async function bancoCommessa(nome: string): Promise<EsitoVoce[]> {
  const cartella = join(ARCHIVIO, 'JOB', nome)
  if (!existsSync(cartella)) return []
  const voci = await q('select * from commesse where nome = ? and voce > 0 order by idversionecommessa desc, voce', [nome])
  const ver = voci[0]?.idversionecommessa
  const righeVoci = voci.filter(v => v.idversionecommessa === ver)
  const filtroV = 'where nomecommessa = ? and idversionecommessa = ?'
  const accFp = await q(`select voce, codice, qta, l, h, un_mis, prezzo, un_vend, costonetto from preventivoprezziaccessori ${filtroV}`, [nome, ver])
  const profFp = await q(`select voce, codice, lung, qta, costonetto from preventivoprezziprofili ${filtroV}`, [nome, ver])
  const vetFp = await q(`select voce, codice, prezzo, qta, l, h, costonetto from preventivoprezzivetri ${filtroV}`, [nome, ver])
  const esiti: EsitoVoce[] = []
  const files = readdirSync(cartella)

  for (const rv of righeVoci) {
    const nv = n(rv.voce)
    const base: Omit<EsitoVoce, 'confronto' | 'avvisi'> = {
      commessa: nome, voce: nv, struttura: '', mano: null, pezzi: 1, costoAccFp: 0, costoAccWs: 0, scartoAcc: 0, scartoProf: 0, scartoVet: 0, scartoPrezzo: 0,
    }
    const file = files.find(f => new RegExp(`_jobrecord_0*${nv}\\.xml$`, 'i').test(f))
    if (!file) continue
    try {
      const testo = new TextDecoder('windows-1252').decode(readFileSync(join(cartella, file)))
      const doc = leggiXml(join(cartella, file))
      const jr = doc.FP_JOBRECORD
      const st = strutturaDaXml({ FP_TREE: jr.FP_TREE })
      base.struttura = s(jr.Str_Origine).split('\\').pop() ?? ''
      base.mano = manoDa(testo)
      base.pezzi = n(jr.Multiply) || 1

      // Regole: serie delle righe dei kit, collegati, righe di catalogo dei kit usati.
      const kit = [...new Set([...testo.matchAll(/<FP_KIT [^>]*Code="([^"]+)"/g)].map(m => m[1]))]
      const codiciAcc = [...new Set([...testo.matchAll(/<FP_FITTING [^>]*Code="([^"]+)"/g)].map(m => m[1]))]
      const righeKit = await inLista(
        'select k.nomekit kit, d.codice, group_concat(x.serieprof) serie from dettagliokit d join kit k on k.pkid = d.kitid ' +
        'left join serieprofilidettagliokit x on x.iddettagliokit = d.iditem where k.nomekit in (?) group by d.iditem', kit)
      const catalogo: Record<string, RigaKitCatalogo[]> = {}
      for (const d of await inLista('select k.nomekit kit, d.* from dettagliokit d join kit k on k.pkid = d.kitid where k.nomekit in (?) order by d.iditem', kit)) {
        const l = catalogo[s(d.kit)] ?? []
        l.push({
          fp_id: n(d.iditem), codice: s(d.codice), tipo: n(d.tipo), quantita: n(d.num_base), opzionale: n(d.opzionale) !== 0,
          dim_rif: n(d.dim_rif), lim_inf: n(d.lim_inf_range), lim_sup: n(d.lim_sup_range), passo: n(d.step),
          formula_r: s(d.formular) || null, formula_dist: s(d.formuladist) || null, dati: d,
        })
        catalogo[s(d.kit)] = l
      }
      const collegati = await inLista(
        'select ap.codice principale, ac.codice collegato, c.num_base from accessoricollegati c ' +
        'join accessori ap on ap.pkid = c.idaccprincipale join accessori ac on ac.pkid = c.idacccollegato where ap.codice in (?)', codiciAcc)
      // Fissaggi per profilo e filtro (contati per angolo nel calcolo) + ordini dei filtri della serie.
      const codiciProfili = [...new Set([...testo.matchAll(/DXF="[^"]*\\([^"\\]+)\.DXF"/gi)].map(m => m[1]))]
      const fiss = await inLista(
        'select p.codice prof, p.serieid serie, a.codice acc, a.fittizio, f.num_base, f.dim_rif, f.filtro, sf.ordine from fissaggi f ' +
        'join profili p on p.pkid = f.idprof join accessori a on a.pkid = f.idacc ' +
        'left join serie_profilo_fissaggi sf on sf.id_serie = p.serieid and sf.filtro_guid = f.filtro ' +
        'where p.codice in (?)', codiciProfili)
      const fissaggiDi = datiFissaggi(
        fiss.map(f => ({ codice_profilo: s(f.prof), codice_accessorio: s(f.acc), serie_fp_id: n(f.serie), quantita: n(f.num_base), dim_rif: n(f.dim_rif), filtro: s(f.filtro) })),
        fiss.filter(f => f.ordine !== null).map(f => ({ serie_fp_id: n(f.serie), ordine: n(f.ordine), filtro: s(f.filtro) })),
        new Set(fiss.filter(f => n(f.fittizio) === 1).map(f => s(f.acc))))
      // Nel file della commessa FP PRO scrive anche il risultato della scomposizione dei contenitori
      // (es. 00259500U sciolto nel nodo accanto al kit con CERN_GIESSE00259500U): nelle .STR usate
      // in produzione non c'e', quindi qui si toglie per confrontare alla pari.
      const contenitoriKit = new Set(st.albero.flatMap(function tutti(nd): string[] {
        return [...nd.kit.flatMap(k => k.accessori.map(a => a.codice)), ...nd.figli.flatMap(tutti)]
      }))
      // Righe sciolte calcolate: figli dei contenitori dei kit e copie dei codici gia' nei kit.
      const figliContenitori = new Set([...contenitoriKit, ...collegati.filter(c => contenitoriKit.has(s(c.principale))).map(c => s(c.collegato))])
      const togliScomposti = (nodi: typeof st.albero) => nodi.forEach(nd => {
        nd.accessori = nd.accessori.filter(a => !figliContenitori.has(a.codice))
        togliScomposti(nd.figli)
      })
      togliScomposti(st.albero)
      const regoleBase = regoleDaElenchi(st.serie,
        righeKit.map(r => ({ kit: s(r.kit), codice: s(r.codice), serie: r.serie ? s(r.serie).split(',') : null })),
        collegati.map(c => ({ principale: s(c.principale), collegato: s(c.collegato), quantita: n(c.num_base), serie: '' })),
        catalogo)
      const regole = { ...regoleBase, fissaggi: fissaggiDi }

      // Listino: prezzi che FP PRO ha usato per questa voce; codici in piu' dal catalogo accessori.
      const accVoce = accFp.filter(a => n(a.voce) === nv)
      // Quantita' FP PRO per un accessorio: metri (un_mis 2, 4: mm in colonna l), metri quadri (un_mis 3, tapparelle: l x h).
      // Accessori a metro quadro (un_mis 3, tapparelle): FP PRO salva larghezza e altezza in mm (colonne l, h).
      const qtaFp = (a: Riga) => [2, 4].includes(n(a.un_mis)) ? n(a.qta) * n(a.l) / 1000 : n(a.un_mis) === 3 ? n(a.qta) * n(a.l) * n(a.h) / 1e6 : n(a.qta)
      const profVoce = profFp.filter(a => n(a.voce) === nv)
      const codiciDxf = [...new Set([...testo.matchAll(/DXF="[^"]*\\([^"\\]+)\.DXF"/gi)].map(m => m[1]))]
      const profili = await inLista('select pkid, codice, composto, kg_ml from profili where codice in (?)', codiciDxf)
      const vetriKg = await inLista('select codice, kg_mq from vetri where codice in (?)', codiciDxf)
      const catAcc = await q('select codice, costo_grezzo, un_vend from accessori where codice in (?)', [[...codiciAcc, '#']])
      const listino: ListinoCalcolo = {
        profilo: codice => {
          const p = profili.find(x => s(x.codice) === codice)
          if (!p) return null
          const righe = profVoce.filter(x => s(x.codice) === codice)
          const metri = righe.reduce((t, x) => t + n(x.lung) * n(x.qta) / 1000, 0)
          const costo = righe.reduce((t, x) => t + n(x.costonetto), 0)
          return { kgMl: n(p.kg_ml), euroKg: null, euroMl: metri > 0 ? costo / metri : 0, fattorePeso: 1, barra: 6500, testa: 30, coda: 30, componenti: [] }
        },
        accessorio: codice => {
          const a = accVoce.find(x => s(x.codice) === codice) ?? catAcc.find(x => s(x.codice) === codice)
          if (!a) return null
          return { prezzo: n(a.prezzo ?? a.costo_grezzo), unitaVendita: n(a.un_vend) || 1 }
        },
        vetro: codice => {
          const v = vetFp.find(x => n(x.voce) === nv && s(x.codice) === codice)
          return { euroMq: n(v?.prezzo), minFatt: 0, kgMq: n(vetriKg.find(x => s(x.codice) === codice)?.kg_mq) }
        },
        pannello: () => ({ euroMq: 0, minFatt: 0 }),
        sezione: codice => {
          const dxf = [...testo.matchAll(/DXF="([^"]+\.DXF)"/gi)].map(m => m[1]).find(f => codiceDaDxf(f) === codice)
          return dxf ? sezione(dxf) : null
        },
      }
      const L = n(rv.l) || n(jr.StyleL)
      const H = n(rv.h) || n(jr.StyleH)
      let albero = st.albero
      if (ACCOSTAMENTI) {
        const c = campioneDi(nome, nv, base.struttura, st, L, H)
        if (c) { albero = applicaAccostamenti(st.albero, c.acc); usatiAccostamenti++ }
        if (process.env.DEBUG_VOCE === `${nome}:${nv}`) {
          console.log('campione', c && `${c.commessa}:${c.voce}`, JSON.stringify(c?.acc))
          console.log('proprio ', JSON.stringify(accostamentiDaCampione(st.albero, { L, H }, larghezzeDaPoligoni(st.poligoni), d => sezione(d))))
        }
      }
      const input: InputVoce = {
        albero, serie: st.serie, poligoni: st.poligoni, L, H, L0: L, H0: H, quote: {},
        kitScelti: {}, vetriScelti: {}, tempi: st.tempi ?? { taglio: 0, lavorazione: 0, montaggio: 0, assemblaggio: 0, posa: 0 },
        profilo: PROFILO, maggiorazioni: { vetri: 0, pannelli: 0 }, mano: base.mano as 'sx' | 'dx' | null,
        fattoreBarre: 1,
      }
      const r = calcolaVoce(input, listino, regole)
      // Diagnosi di una voce: DEBUG_VOCE=101-26G:31
      if (process.env.DEBUG_VOCE === `${nome}:${nv}`) {
        console.log('\nante', JSON.stringify(r.ante))
        console.log('accessori WS', JSON.stringify(r.righe.filter(x => x.gruppo === 'accessori').map(x => [x.codice, x.quantita])))
        console.log('accessori FP', JSON.stringify(accVoce.map(a => [a.codice, a.qta])))
        console.log('vetri WS', JSON.stringify(r.righe.filter(x => x.gruppo === 'vetri').map(x => [x.codice, x.descrizione, x.quantita])))
        console.log('vetri FP', JSON.stringify(vetFp.filter(x => n(x.voce) === nv).map(x => [s(x.codice), n(x.l), n(x.h), n(x.qta)])))
        const kitNodi = (nodi: typeof st.albero): string[] => nodi.flatMap(nd => [
          ...nd.kit.map((k, i) => `${nd.codice}:${i} ${k.codice} conf=${k.confermato} righe=${k.accessori.map(a => `${a.codice}[${a.dimRif};${(a.altreCondizioni ?? []).map(c => c.dim).join(',')}]`).join(' ')}`),
          ...kitNodi(nd.figli)])
        console.log(kitNodi(st.albero).join('\n'))
        const { pezzi } = pezziECampi(albero, input, LARGHEZZE_PREDEFINITE, d => listino.sezione(codiceDaDxf(d)))
        console.log('pezzi', JSON.stringify(pezzi.map(p => [p.tipo, codiceDaDxf(p.dxf), Math.round(p.lunghezza)])))
        console.log('fissaggi FP', JSON.stringify(fiss.map(f => [s(f.prof), s(f.acc), n(f.num_base), n(f.dim_rif), s(f.filtro).slice(0, 8), n(f.ordine)])))
        // Costo per codice: quantita' e costo di WinStudio contro FP PRO (per un pezzo), scarti maggiori prima.
        const costi = new Map<string, { qWs: number; cWs: number; qFp: number; cFp: number; prezzoFp: number; unVend: number; unMis: number }>()
        const riga = (c: string) => costi.get(c) ?? { qWs: 0, cWs: 0, qFp: 0, cFp: 0, prezzoFp: 0, unVend: 0, unMis: 0 }
        for (const x of r.righe.filter(x => x.gruppo === 'accessori')) costi.set(x.codice, { ...riga(x.codice), qWs: riga(x.codice).qWs + x.quantita, cWs: riga(x.codice).cWs + x.costo })
        for (const a of accVoce) {
          const c = s(a.codice), v = riga(c)
          costi.set(c, { ...v, qFp: v.qFp + qtaFp(a) / base.pezzi, cFp: v.cFp + n(a.costonetto) / base.pezzi, prezzoFp: n(a.prezzo), unVend: n(a.un_vend), unMis: n(a.un_mis) })
        }
        console.log('codice | q WS | costo WS | q FP | costo FP | prezzo FP | un_vend | un_mis')
        for (const [c, v] of [...costi].sort((a, b) => Math.abs(b[1].cWs - b[1].cFp) - Math.abs(a[1].cWs - a[1].cFp)).slice(0, 25)) {
          console.log(c, '|', v.qWs.toFixed(2), '|', v.cWs.toFixed(2), '|', v.qFp.toFixed(2), '|', v.cFp.toFixed(2), '|', v.prezzoFp, '|', v.unVend, '|', v.unMis)
        }
      }
      const accWs = r.righe.filter(x => x.gruppo === 'accessori')
      // FP PRO salva le quantita' della voce per tutti i pezzi (Multiply): si riportano a un pezzo.
      // Accessori a metro (un_mis 2 e 4): FP PRO salva la lunghezza in mm nella colonna l.
      const accFpPezzo = accVoce.map(a => ({ codice: s(a.codice), quantita: qtaFp(a) / base.pezzi }))
      base.costoAccFp = accVoce.reduce((t, a) => t + n(a.costonetto), 0) / base.pezzi
      base.costoAccWs = accWs.reduce((t, a) => t + a.costo, 0)
      base.scartoAcc = base.costoAccWs - base.costoAccFp
      const somma = (righe: Riga[], f: (x: Riga) => number) => righe.reduce((t, x) => t + f(x), 0)
      base.scartoProf = 0 // profili: confronto non affidabile qui (composti e barre di FP PRO non ricostruiti)
      const vetVoce = vetFp.filter(x => n(x.voce) === nv)
      const mqFp = somma(vetVoce, x => n(x.qta) * n(x.l) * n(x.h) / 1e6) / base.pezzi
      const costoVetFp = somma(vetVoce, x => n(x.costonetto)) / base.pezzi
      const mqWs = r.righe.filter(x => x.gruppo === "vetri").reduce((t, x) => t + x.quantita, 0)
      base.scartoVet = mqWs - mqFp // mÂ² di vetro in piu' (+) o in meno (-) per pezzo; costoVetFp solo per il riepilogo
      void costoVetFp
      const matFp = n(rv.costoprofili) + n(rv.costoaccessori) + n(rv.costoguarnizioni) + n(rv.costovetri) + n(rv.costopannelli)
      // Stima sul prezzo da accessori: ricarico medio di FP PRO sui materiali (imponibile / materiali della voce).
      base.scartoPrezzo = base.scartoAcc * (matFp > 0 && n(rv.imponibile) > 0 ? Math.min(3, n(rv.imponibile) / matFp) : 1.6)
      esiti.push({ ...base, confronto: confrontaAccessori(accWs.map(a => ({ codice: a.codice, quantita: a.quantita })), accFpPezzo), avvisi: r.avvisi })
    } catch (e) {
      esiti.push({ ...base, confronto: { inPiu: [], mancanti: [], diverse: [] }, avvisi: [], errore: String(e) })
    }
  }
  return esiti
}

const commesse = (await q(
  'select nome from commesse where voce > 0 and imponibile > 0 and nome like ? group by nome order by nome', [`%${filtro}%`],
)).map(r => s(r.nome))
const tutti: EsitoVoce[] = []
for (const c of commesse) {
  tutti.push(...await bancoCommessa(c))
  process.stdout.write('.')
}
await db.chiudi()

if (ACCOSTAMENTI) console.log(`
accostamenti: ${campioni.size} strutture campione, usati su ${usatiAccostamenti} voci`)
const valide = tutti.filter(e => !e.errore)
const fascia = (e: EsitoVoce) => Math.abs(e.scartoPrezzo)
const conteggio = {
  voci: valide.length,
  errori: tutti.length - valide.length,
  entro5: valide.filter(e => fascia(e) <= 5).length,
  entro50: valide.filter(e => fascia(e) > 5 && fascia(e) <= 50).length,
  oltre50: valide.filter(e => fascia(e) > 50).length,
}
const regoleNonGestite = new Map<string, number>()
for (const e of valide) for (const a of e.avvisi) {
  const m = /Regola FP PRO non gestita: misura (\S+)/.exec(a)
  if (m) regoleNonGestite.set(m[1], (regoleNonGestite.get(m[1]) ?? 0) + 1)
}
const peggiori = [...valide].sort((a, b) => fascia(b) - fascia(a)).slice(0, 30)
mkdirSync(USCITA, { recursive: true })
writeFileSync(join(USCITA, 'banco-prova.json'), JSON.stringify({ conteggio, regoleNonGestite: Object.fromEntries(regoleNonGestite), tutti }, null, 1))
console.log('\n', conteggio)
console.log('codici di misura non gestiti:', Object.fromEntries(regoleNonGestite))
for (const e of peggiori) {
  console.log(`${e.commessa} v${e.voce} ${e.struttura} mano=${e.mano} x${e.pezzi}: prezzo~ ${e.scartoPrezzo.toFixed(0)} | accessori ${e.scartoAcc.toFixed(2)} | vetro mÂ² ${e.scartoVet.toFixed(3)}`,
    'piu', JSON.stringify(e.confronto.inPiu.slice(0, 6)), 'meno', JSON.stringify(e.confronto.mancanti.slice(0, 6)), 'diverse', JSON.stringify(e.confronto.diverse.slice(0, 4)))
}
for (const e of tutti.filter(x => x.errore).slice(0, 10)) console.log('ERRORE', e.commessa, e.voce, e.errore)
