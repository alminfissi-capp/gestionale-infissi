// Esposizione verso le banche: fido di cassa sui conti correnti e anticipi fattura.
// Logica pura: niente React, niente Supabase, e `oggi` arriva sempre dal chiamante come
// 'YYYY-MM-DD' — le date ISO si confrontano come stringhe e i test restano riproducibili.
//
// Due convenzioni d'inserimento opposte, entrambe volute (vedi la spec):
//  · conto corrente → si scrive il DISPONIBILE, l'utilizzato si ricava
//  · linea di credito → si scrivono i singoli ANTICIPI, utilizzato e disponibile si ricavano

export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export type ContoBancaRow = {
  id: string
  nome: string
  disponibile: number // saldo_attuale: quanto si può spendere, fido incluso
  accordato: number   // fido_accordato
}

export type LineaCreditoRow = {
  id: string
  nome: string
  tipo: TipoLineaCredito
  accordato: number
}

export type AnticipoRow = {
  id: string
  linea_id: string
  // Un anticipo può coprire più commesse: una sola fattura emessa per più lavori.
  // L'importo non si spezza fra loro — la banca anticipa la fattura, non il singolo
  // lavoro — quindi le commesse servono solo a sommare quanto il cliente deve ancora.
  commesse_ids: string[]
  descrizione: string
  importo: number
  data_scadenza: string | null // 'YYYY-MM-DD'
  rimborsato: boolean
}

// Quello che la pagina sa delle commesse collegate. Chiave = commessa_id.
// Una chiave mancante non è un errore: l'anticipo si mostra senza residuo.
export type InfoCommessa = { etichetta: string; residuo: number }

export type AnticipoCalcolato = AnticipoRow & {
  // Solo le commesse effettivamente trovate in `commesse`: se una manca (per esempio
  // perché è stata cancellata) sparisce da qui, e `daChiudere` non si accende.
  commesse: { id: string; etichetta: string; residuo: number }[]
  residuoCommesse: number | null // somma dei residui noti; null se non se ne conosce nessuna
  scaduto: boolean
  daChiudere: boolean // tutte le commesse collegate risultano saldate: promemoria, non azione
}

export type UtilizzoBanca = {
  id: string
  nome: string
  accordato: number
  disponibile: number
  utilizzato: number
  residuo: number
  anticipi: AnticipoCalcolato[] // sempre vuoto per i conti correnti
}

export type RiepilogoBanche = {
  conti: UtilizzoBanca[] // quelli con un fido accordato o con uno scoperto in corso
  linee: UtilizzoBanca[]
  liquiditaPropria: number // Σ max(0, disponibile − accordato) sui conti
  fidoCassaUtilizzato: number
  lineeUtilizzato: number
  utilizzatoTotale: number
  residuoTotale: number
  anticipiScaduti: number
  anticipiDaChiudere: number
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Floor per singola entità, come per i crediti da commessa e i conti dipendenti:
// un conto in attivo non deve mascherare il rosso di un altro.
export function utilizzoConto(c: ContoBancaRow): {
  utilizzato: number
  propria: number
  residuo: number
} {
  const accordato = num(c.accordato)
  const disponibile = num(c.disponibile)
  return {
    utilizzato: Math.max(0, accordato - disponibile),
    propria: Math.max(0, disponibile - accordato),
    residuo: Math.max(0, Math.min(disponibile, accordato)),
  }
}

export function riepilogoBanche(
  conti: ContoBancaRow[],
  linee: LineaCreditoRow[],
  anticipi: AnticipoRow[],
  commesse: Record<string, InfoCommessa>,
  oggi: string,
): RiepilogoBanche {
  let liquiditaPropria = 0
  let fidoCassaUtilizzato = 0
  const contiUso: UtilizzoBanca[] = []

  for (const c of conti) {
    const { utilizzato, propria, residuo } = utilizzoConto(c)
    liquiditaPropria += propria
    fidoCassaUtilizzato += utilizzato
    // Fuori dal dettaglio solo i conti che non hanno niente da dire: né un fido
    // accordato né uno scoperto in corso. Un conto senza fido ma in rosso ci deve
    // stare, altrimenti il suo scoperto entra nel totale senza una riga che lo
    // spieghi e il dettaglio non torna più col totale.
    if (num(c.accordato) <= 0 && utilizzato <= 0) continue
    contiUso.push({
      id: c.id,
      nome: c.nome,
      accordato: num(c.accordato),
      disponibile: num(c.disponibile),
      utilizzato,
      residuo,
      anticipi: [],
    })
  }

  // ── Anticipi aperti, raggruppati per linea ──
  // I rimborsati non sono più debito e liberano il plafond: escono subito, e con loro
  // escono anche i loro contatori. Lo storico si consulta nell'interfaccia, non qui.
  // Si assume che ogni anticipo punti a una linea presente in `linee`: la FK è
  // ON DELETE CASCADE e le due liste arrivano dalla stessa organizzazione. Se
  // l'assunzione saltasse, l'anticipo orfano sparirebbe da ogni totale senza un
  // rumore — il test "anticipo orfano" qui sotto fissa questo comportamento perché
  // resti una scelta consapevole e non una sorpresa.
  const apertiPerLinea = new Map<string, AnticipoCalcolato[]>()
  let anticipiScaduti = 0
  let anticipiDaChiudere = 0

  for (const a of anticipi) {
    if (a.rimborsato) continue
    const ids = a.commesse_ids ?? []
    const collegate = ids.flatMap((id) => {
      const info = commesse[id]
      return info ? [{ id, etichetta: info.etichetta, residuo: info.residuo }] : []
    })
    const residuoCommesse = collegate.length > 0
      ? collegate.reduce((s, c) => s + num(c.residuo), 0)
      : null
    const scaduto = !!a.data_scadenza && a.data_scadenza < oggi
    // Promemoria, non azione: finché non si spunta "rimborsato" l'anticipo resta
    // nei debiti e occupa il plafond.
    // Si accende solo se TUTTE le commesse collegate sono note e insieme non devono
    // più niente: con una fattura che copre più lavori, la banca rientra quando il
    // cliente ha saldato tutto, non il primo pezzo. Se anche una sola commessa non
    // si trova, non si può dire che sia saldata e il promemoria resta spento.
    const tutteNote = ids.length > 0 && collegate.length === ids.length
    const daChiudere = tutteNote && (residuoCommesse ?? 0) <= 0
    if (scaduto) anticipiScaduti += 1
    if (daChiudere) anticipiDaChiudere += 1
    const calcolato: AnticipoCalcolato = {
      ...a,
      importo: num(a.importo),
      commesse: collegate,
      residuoCommesse,
      scaduto,
      daChiudere,
    }
    const list = apertiPerLinea.get(a.linea_id) ?? []
    list.push(calcolato)
    apertiPerLinea.set(a.linea_id, list)
  }

  // ── Linee: si scrivono gli anticipi, utilizzato e disponibile si ricavano ──
  // A differenza dei conti, qui non si filtra nulla: una linea di credito è
  // un'entità che l'utente ha configurato apposta, e vale sempre la pena mostrarla
  // (la schermata Calcoli elenca anche le linee inutilizzate). Un conto senza fido
  // invece non ha niente a che fare con questa funzionalità.
  let lineeUtilizzato = 0
  const lineeUso: UtilizzoBanca[] = linee.map((l) => {
    const accordato = num(l.accordato)
    const aperti = apertiPerLinea.get(l.id) ?? []
    const utilizzato = aperti.reduce((s, a) => s + a.importo, 0)
    const disponibile = Math.max(0, accordato - utilizzato)
    lineeUtilizzato += utilizzato
    return {
      id: l.id,
      nome: l.nome,
      accordato,
      disponibile,
      utilizzato,
      residuo: disponibile,
      anticipi: aperti,
    }
  })

  const utilizzatoTotale = fidoCassaUtilizzato + lineeUtilizzato
  const residuoTotale =
    contiUso.reduce((s, c) => s + c.residuo, 0) + lineeUso.reduce((s, l) => s + l.residuo, 0)

  return {
    conti: contiUso,
    linee: lineeUso,
    liquiditaPropria,
    fidoCassaUtilizzato,
    lineeUtilizzato,
    utilizzatoTotale,
    residuoTotale,
    anticipiScaduti,
    anticipiDaChiudere,
  }
}
