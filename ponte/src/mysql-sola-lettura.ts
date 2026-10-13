// Il database di FP PRO si LEGGE soltanto, MAI si modifica. Due difese indipendenti:
// 1. ogni connessione e' aperta in sola lettura (SET SESSION TRANSACTION READ ONLY):
//    anche un comando sbagliato verrebbe rifiutato da MySQL;
// 2. ogni comando passa da soloLettura() prima di partire: le scritture non arrivano a MySQL.
// All'avvio si chiede a MySQL se la sessione e' davvero in sola lettura: se no, il ponte non parte.
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { soloLettura } from '../../lib/fppro/ponte-regole.ts'

export interface DbLettura {
  leggi(sql: string, parametri?: unknown[]): Promise<RowDataPacket[]>
  chiudi(): Promise<void>
}

export async function apriDbSolaLettura(cfg: mysql.PoolOptions): Promise<DbLettura> {
  const pool = mysql.createPool({ ...cfg, multipleStatements: false, connectionLimit: 2 })
  // Prima di qualunque altro comando, la connessione passa in sola lettura.
  pool.pool.on('connection', c => {
    c.query('SET SESSION TRANSACTION READ ONLY')
  })
  const leggi = async (sql: string, parametri: unknown[] = []) => {
    if (!soloLettura(sql)) throw new Error(`Bloccato: il ponte legge soltanto FP PRO, comando non di lettura: ${sql.slice(0, 80)}`)
    const [righe] = await pool.query<RowDataPacket[]>(sql, parametri)
    return righe
  }
  // Verifica: MySQL deve confermare la sola lettura (transaction_read_only dalla 5.7.20, prima tx_read_only).
  let stato: unknown
  try {
    stato = (await leggi('select @@session.transaction_read_only as v'))[0]?.v
  } catch {
    stato = (await leggi('select @@session.tx_read_only as v'))[0]?.v
  }
  if (Number(stato) !== 1) {
    await pool.end()
    throw new Error('MySQL non conferma la sola lettura: il ponte non parte per non rischiare di modificare FP PRO')
  }
  return { leggi, chiudi: () => pool.end() }
}
