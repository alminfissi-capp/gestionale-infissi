// Estrae una commessa calcolata da FP PRO in fixture per i test del motore di calcolo
// (lib/fppro/calcolo). Legge il MySQL di FP PRO in sola lettura.
// Uso (dalla cartella ponte): node --env-file=<.env del ponte> strumenti/estrai-commessa.ts 170-26G
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apriDbSolaLettura } from '../src/mysql-sola-lettura.ts'
import { sezioneDaDxf } from '../../lib/fppro/dxf-sezione.ts'

const nome = process.argv[2]
const cartellaJob = process.argv[3] ?? 'C:\\FP_PRO\\ARCHIVI_EDILSIDER_NEW\\JOB'
if (!nome) throw new Error('Manca il nome della commessa')
const uscita = join(import.meta.dirname, '..', '..', 'lib', 'fppro', '__fixtures__')

// Sola lettura, come il ponte: FP PRO non si modifica mai.
const db = await apriDbSolaLettura({
  host: process.env.FP_MYSQL_HOST, port: Number(process.env.FP_MYSQL_PORT), user: process.env.FP_MYSQL_USER,
  password: process.env.FP_MYSQL_PASSWORD, database: process.env.FP_MYSQL_DATABASE,
})
const q = async (sql: string, p: unknown[] = []) => (await db.leggi(sql, p)) as Record<string, unknown>[]
const n = (v: unknown) => Number(v ?? 0)

const [c] = await q('select * from commesse where nome = ? and voce = 1 order by idversionecommessa desc limit 1', [nome])
if (!c) throw new Error(`Commessa ${nome} non trovata`)
const ver = n(c.idversionecommessa)
const filtro = 'where nomecommessa = ? and idversionecommessa = ? and voce = 1'
const [cfg] = await q('select * from fp_configprev where nomecommessa = ? and versionecommessa = ? limit 1', [nome, ver])
const prof = await q(`select * from preventivoprezziprofili ${filtro}`, [nome, ver])
const acc = await q(`select * from preventivoprezziaccessori ${filtro}`, [nome, ver])
const vet = await q(`select * from preventivoprezzivetri ${filtro}`, [nome, ver])
const pan = await q(`select * from preventivoprezzipannelli ${filtro}`, [nome, ver])
const lav = await q(`select * from speselav ${filtro}`, [nome, ver])
const spe = await q(`select * from spesevarie ${filtro}`, [nome, ver])

// File della commessa senza immagini.
const dir = join(cartellaJob, nome)
const file = readdirSync(dir).find(f => /_jobrecord_01\.xml$/i.test(f))
if (!file) throw new Error(`Nessun jobrecord in ${dir}`)
const xml = new TextDecoder('windows-1252').decode(readFileSync(join(dir, file)))
  .replace(/<picture[^>]*>[\s\S]*?<\/picture>/g, '').replace(/<picture_alt_sight[^>]*>[\s\S]*?<\/picture_alt_sight>/g, '')

// Profili usati (codici dei DXF): componenti dei composti, barre, scarti, pesi.
const codici = [...new Set([...xml.matchAll(/DXF="[^"]*\\([^"\\]+)\.DXF"/gi)].map(m => m[1]))]
const profili = await q('select pkid, codice, composto, kg_ml from profili where codice in (?)', [codici])
const composti = profili.filter(p => n(p.composto) !== 0)
const componenti = composti.length === 0 ? [] : await q(
  'select pc.codice composto, c.codice componente, c.kg_ml, x.master, x.offset from profilicomponenti x ' +
  'join profili pc on pc.pkid = x.profcompostoid join profili c on c.pkid = x.profcomponenteid where pc.codice in (?) order by x.pkid',
  [composti.map(p => p.codice)],
)
const tutti = [...new Set([...profili.map(p => String(p.codice)), ...componenti.map(x => String(x.componente))])]
const barre = await q('select p.codice, b.lung from barlen b join profili p on p.pkid = b.profiloid where p.codice in (?)', [tutti])
const scarti = await q('select codice, frontwaste, endwaste from serie_profili_scarti where codice in (?) group by codice, frontwaste, endwaste', [tutti])

// Regole degli accessori: serie delle righe dei kit usati, accessori collegati, peso dei vetri.
const kits = [...new Set([...xml.matchAll(/<FP_KIT [^>]*Code="([^"]+)"/g)].map(m => m[1]))]
const righeKit = kits.length === 0 ? [] : await q(
  'select k.nomekit kit, d.codice, group_concat(x.serieprof) serie from dettagliokit d join kit k on k.pkid = d.kitid ' +
  'left join serieprofilidettagliokit x on x.iddettagliokit = d.iditem where k.nomekit in (?) group by d.iditem order by d.iditem',
  [kits],
)
const codiciAcc = [...new Set([...xml.matchAll(/<FP_FITTING [^>]*Code="([^"]+)"/g)].map(m => m[1]))]
const collegati = codiciAcc.length === 0 ? [] : await q(
  'select ap.codice principale, ac.codice collegato, c.num_base from accessoricollegati c ' +
  'join accessori ap on ap.pkid = c.idaccprincipale join accessori ac on ac.pkid = c.idacccollegato where ap.codice in (?)',
  [codiciAcc],
)
const codiciVetri = [...new Set([...xml.matchAll(/DXF="GLASSES\\([^"]+)\.DXF"/gi)].map(m => m[1]))]
const vetriKg = codiciVetri.length === 0 ? [] : await q('select codice, kg_mq from vetri where codice in (?)', [codiciVetri])

// Misure in vista dai DXF dei profili della commessa.
const cartellaDxf = join(cartellaJob, '..', 'DXF')
const sezioni = [...new Set([...xml.matchAll(/DXF="([^"]+\.DXF)"/gi)].map(m => m[1]))]
  .filter(f => !/^(GLASSES|PANELS)\\/i.test(f))
  .flatMap(f => {
    try {
      const s = sezioneDaDxf(new TextDecoder('windows-1252').decode(readFileSync(join(cartellaDxf, f))))
      return s ? [{ codice: f.slice(f.lastIndexOf('\\') + 1).replace(/\.dxf$/i, ''), ...s }] : []
    } catch {
      return []
    }
  })

const fixture = {
  nome, voce: 1, versione: ver, l: n(c.l), h: n(c.h),
  config: {
    nome: cfg?.nome ?? null, spese_generali: n(c.spesegenerali), utile: n(c.utile), provvigione: n(c.provvigioni),
  },
  lavoro: lav.map(r => ({ descrizione: String(r.descrspesa), ore: n(r.tempo), euroOra: n(r.prezzoh), prezzo: n(r.prezzo) })),
  speseVarie: spe.map(r => ({ descrizione: String(r.descrspesa), perc: n(r.percvoce), fisso: n(r.prezzofisso), prezzo: n(r.prezzo) })),
  profili: prof.map(r => ({ codice: String(r.codice), lunghezza: n(r.lung), quantita: n(r.qta), kgMl: n(r.kg_ml), peso: n(r.peso), costo: n(r.costonetto) })),
  accessori: acc.map(r => ({ codice: String(r.codice), descrizione: String(r.descr ?? ''), quantita: n(r.qta), prezzo: n(r.prezzo), unitaVendita: n(r.un_vend), costo: n(r.costonetto) })),
  vetri: vet.map(r => ({ codice: String(r.codice), quantita: n(r.qta), l: n(r.l), h: n(r.h), prezzoMq: n(r.prezzo), costo: n(r.costonetto) })),
  pannelli: pan.map(r => ({ codice: String(r.codice), quantita: n(r.qta), l: n(r.l), h: n(r.h), prezzoMq: n(r.prezzo), costo: n(r.costonetto) })),
  anagrafica: {
    profili: profili.map(p => ({ codice: String(p.codice), composto: n(p.composto) !== 0, kgMl: n(p.kg_ml) })),
    componenti: componenti.map(x => ({ composto: String(x.composto), componente: String(x.componente), kgMl: n(x.kg_ml), principale: n(x.master) !== 0, offset: n(x.offset) })),
    barre: barre.map(b => ({ codice: String(b.codice), lunghezza: n(b.lung) })),
    scarti: scarti.map(s => ({ codice: String(s.codice), testa: n(s.frontwaste), coda: n(s.endwaste) })),
    righeKit: righeKit.map(r => ({ kit: String(r.kit), codice: String(r.codice), serie: r.serie ? String(r.serie).split(',') : null })),
    collegati: collegati.map(c => ({ principale: String(c.principale), collegato: String(c.collegato), quantita: n(c.num_base) })),
    vetri: vetriKg.map(v => ({ codice: String(v.codice), kgMq: n(v.kg_mq) })),
    sezioni,
  },
  totali: {
    costoProfili: n(c.costoprofili), costoAccessori: n(c.costoaccessori), costoGuarnizioni: n(c.costoguarnizioni),
    costoVetri: n(c.costovetri), costoPannelli: n(c.costopannelli), costoPuro: n(c.costopuro),
    costoIndustriale: n(c.costoindustriale), imponibile: n(c.imponibile),
  },
}
writeFileSync(join(uscita, `commessa-${nome}.json`), JSON.stringify(fixture, null, 2) + '\n')
writeFileSync(join(uscita, `commessa-${nome}.xml`), xml)
console.log('fatto', nome, 'versione', ver, 'profili', fixture.profili.length, 'accessori', fixture.accessori.length)
await db.chiudi()
