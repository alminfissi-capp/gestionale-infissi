import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import type { TotaliResoconto } from '@/lib/resoconto'
import type { ResocontoCommessaInput } from '@/types/resoconto'
import type { Settings } from '@/types/impostazioni'

const TEAL       = '#0E8F9C'
const GRAY_BDR   = '#D1D5DB'
const GRAY_LIGHT = '#F9FAFB'
const GRAY_TEXT  = '#6B7280'
const GRAY_MID   = '#9CA3AF'
const GRAY_HAIR  = '#E5E7EB'
const TEXT_DARK  = '#111827'
const TEXT_MED   = '#374151'
const AMBER_BG   = '#FFFBEB'
const AMBER_BDR  = '#FDE68A'
const AMBER_TXT  = '#92400E'

export type IncassoResoconto = {
  data: string
  riferimento: string
  metodo: string
  importo: number
}

function formatData(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: TEXT_DARK,
    paddingHorizontal: 38,
    paddingTop: 34,
    paddingBottom: 52,
    lineHeight: 1.4,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', gap: 12, flex: 1, alignItems: 'flex-start' },
  logo: { height: 42, maxWidth: 100, objectFit: 'contain' },
  denominazione: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 2 },
  infoTxt: { color: GRAY_TEXT, fontSize: 7.5, marginBottom: 1 },
  titolo: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: TEXT_DARK, textAlign: 'right' },
  titoloSub: { color: GRAY_TEXT, fontSize: 7.5, textAlign: 'right', marginTop: 3 },
  regolo: { borderBottomWidth: 2, borderBottomColor: TEAL, marginTop: 10, marginBottom: 12 },

  // Fascia cliente / commessa / progetto
  fascia: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: GRAY_HAIR, borderRadius: 4,
    backgroundColor: GRAY_LIGHT,
    padding: 10, gap: 14, marginBottom: 14,
  },
  fasciaCol: { flex: 1 },
  etichetta: { color: GRAY_MID, fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 3 },
  fasciaTitolo: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: TEXT_DARK },
  fasciaTxt: { fontSize: 7.5, color: GRAY_TEXT, marginTop: 1 },

  // Sezioni
  sezioneTitolo: {
    fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: TEAL,
    letterSpacing: 0.8, marginBottom: 5,
  },
  sezione: { marginBottom: 14 },

  // Tabelle
  thead: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: GRAY_BDR,
    paddingBottom: 3, marginBottom: 1,
  },
  th: { color: GRAY_MID, fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 4 },
  td: { fontSize: 8, color: TEXT_MED },
  tdMuted: { fontSize: 8, color: GRAY_TEXT },
  trTot: { flexDirection: 'row', paddingTop: 5, marginTop: 1, borderTopWidth: 1, borderTopColor: GRAY_BDR },
  tdTot: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },

  colNum:  { width: 74 },
  colData: { width: 54 },
  colDesc: { flex: 1, paddingRight: 8 },
  colImp:  { width: 66, textAlign: 'right' },
  colIva:  { width: 58, textAlign: 'right' },
  colTot:  { width: 66, textAlign: 'right' },

  colIncData: { width: 70 },
  colIncRif:  { width: 90 },
  colIncMet:  { flex: 1 },
  colIncImp:  { width: 80, textAlign: 'right' },

  notaTabella: { fontSize: 7, color: GRAY_MID, marginTop: 5, lineHeight: 1.35 },

  // Situazione contabile
  box: {
    borderWidth: 1, borderColor: GRAY_HAIR, borderRadius: 4,
    backgroundColor: GRAY_LIGHT, padding: 10,
  },
  boxRiga: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  boxRigaSep: { borderTopWidth: 1, borderTopColor: GRAY_HAIR },
  boxLabel: { fontSize: 8.5, color: TEXT_MED },
  boxLabelBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  boxVal: { fontSize: 8.5, color: TEXT_MED },
  boxValBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  saldoLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  saldoVal: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: TEAL },

  // Nota
  nota: {
    borderWidth: 1, borderColor: AMBER_BDR, borderRadius: 4,
    backgroundColor: AMBER_BG, padding: 9, marginTop: 12,
  },
  notaTitolo: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: AMBER_TXT, marginBottom: 3 },
  notaTxt: { fontSize: 7.5, color: AMBER_TXT, lineHeight: 1.45 },

  chiusura: { fontSize: 7, color: GRAY_MID, marginTop: 12, lineHeight: 1.4 },

  // Firme
  firme: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  firmaCol: { width: 200 },
  firmaLabel: { fontSize: 8, color: TEXT_MED, marginBottom: 26 },
  firmaNome: { fontSize: 8, color: TEXT_MED, marginBottom: 3 },
  firmaLinea: { borderBottomWidth: 1, borderBottomColor: GRAY_MID, width: 190 },

  piede: {
    position: 'absolute', bottom: 24, left: 38, right: 38,
    borderTopWidth: 1, borderTopColor: GRAY_HAIR, paddingTop: 6,
    textAlign: 'center', fontSize: 6.5, color: GRAY_MID,
  },
})

interface Props {
  resoconto: ResocontoCommessaInput
  totali: TotaliResoconto
  incassi: IncassoResoconto[]
  clienteNome: string
  numeroCommessa: string
  settings: Settings | null
  logoUrl: string | null
}

export default function ResocontoPdfDocument({
  resoconto, totali, incassi, clienteNome, numeroCommessa, settings, logoUrl,
}: Props) {
  const r = resoconto

  const haCantiere = Boolean(r.cantiere_nome || r.cantiere_indirizzo)
  const haProgetto = Boolean(r.progetto_titolo || r.progetto_sottotitolo || r.progetto_cup)
  const haNota = Boolean(r.nota_titolo || r.nota_testo)
  const haCoordinate = Boolean(settings?.banca || settings?.iban)
  const mostraNonFatturato = r.righe_preventivi.length > 0 && totali.preventivatoNonFatturato !== 0

  const datiFiscaliCliente = [
    r.cliente_piva ? `P.IVA ${r.cliente_piva}` : null,
    r.cliente_cf ? `C.F. ${r.cliente_cf}` : null,
  ].filter(Boolean).join(' – ')

  const contatti = [settings?.telefono ? `Tel. ${settings.telefono}` : null, settings?.email, settings?.sito_web]
    .filter(Boolean).join(' – ')

  const datiFiscaliAzienda = [
    settings?.piva ? `P.IVA ${settings.piva}` : null,
    settings?.codice_fiscale ? `C.F. ${settings.codice_fiscale}` : null,
  ].filter(Boolean).join(' – ')

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Intestazione aziendale ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            <View style={{ flex: 1 }}>
              {settings?.denominazione && (
                <Text style={s.denominazione}>{settings.denominazione}</Text>
              )}
              {settings?.indirizzo && <Text style={s.infoTxt}>{settings.indirizzo}</Text>}
              {datiFiscaliAzienda !== '' && <Text style={s.infoTxt}>{datiFiscaliAzienda}</Text>}
              {contatti !== '' && <Text style={s.infoTxt}>{contatti}</Text>}
            </View>
          </View>
          <View style={{ width: 170 }}>
            <Text style={s.titolo}>RESOCONTO ECONOMICO</Text>
            <Text style={s.titolo}>DI COMMESSA</Text>
            <Text style={s.titoloSub}>
              Documento riepilogativo – emesso il {formatData(r.data_documento)}
            </Text>
          </View>
        </View>

        <View style={s.regolo} />

        {/* ── Cliente, commessa, progetto ── */}
        <View style={s.fascia}>
          <View style={s.fasciaCol}>
            <Text style={s.etichetta}>CLIENTE</Text>
            <Text style={s.fasciaTitolo}>{clienteNome}</Text>
            {r.cliente_indirizzo && <Text style={s.fasciaTxt}>{r.cliente_indirizzo}</Text>}
            {datiFiscaliCliente !== '' && <Text style={s.fasciaTxt}>{datiFiscaliCliente}</Text>}
          </View>

          <View style={s.fasciaCol}>
            <Text style={s.etichetta}>N. COMMESSA</Text>
            <Text style={s.fasciaTitolo}>{numeroCommessa || '—'}</Text>
            {haCantiere && (
              <>
                {r.cantiere_nome && <Text style={s.fasciaTxt}>Cantiere: {r.cantiere_nome}</Text>}
                {r.cantiere_indirizzo && <Text style={s.fasciaTxt}>{r.cantiere_indirizzo}</Text>}
              </>
            )}
          </View>

          {haProgetto && (
            <View style={s.fasciaCol}>
              <Text style={s.etichetta}>PROGETTO</Text>
              {r.progetto_titolo && <Text style={s.fasciaTitolo}>{r.progetto_titolo}</Text>}
              {r.progetto_sottotitolo && <Text style={s.fasciaTxt}>{r.progetto_sottotitolo}</Text>}
              {r.progetto_cup && <Text style={s.fasciaTxt}>CUP {r.progetto_cup}</Text>}
            </View>
          )}
        </View>

        {/* ── Preventivi accettati ── */}
        {r.righe_preventivi.length > 0 && (
          <View style={s.sezione}>
            <Text style={s.sezioneTitolo}>PREVENTIVI ACCETTATI</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.colNum]}>PREVENTIVO</Text>
              <Text style={[s.th, s.colData]}>DATA</Text>
              <Text style={[s.th, s.colDesc]}>OGGETTO</Text>
              <Text style={[s.th, s.colImp]}>IMPONIBILE</Text>
              <Text style={[s.th, s.colIva]}>IVA</Text>
              <Text style={[s.th, s.colTot]}>TOTALE</Text>
            </View>
            {r.righe_preventivi.map((p, i) => (
              <View key={`${p.numero}-${i}`} style={s.tr}>
                <Text style={[s.td, s.colNum]}>{p.numero}</Text>
                <Text style={[s.tdMuted, s.colData]}>{formatData(p.data)}</Text>
                <Text style={[s.tdMuted, s.colDesc]}>{p.oggetto}</Text>
                <Text style={[s.td, s.colImp]}>{formatEuro(p.imponibile)}</Text>
                <Text style={[s.td, s.colIva]}>{formatEuro(p.iva)}</Text>
                <Text style={[s.td, s.colTot]}>{formatEuro(p.totale)}</Text>
              </View>
            ))}
            <View style={s.trTot}>
              <Text style={[s.tdTot, s.colNum]}>TOTALE</Text>
              <Text style={[s.tdTot, s.colData]} />
              <Text style={[s.tdTot, s.colDesc]}>PREVENTIVATO</Text>
              <Text style={[s.tdTot, s.colImp]}>{formatEuro(totali.preventivatoImponibile)}</Text>
              <Text style={[s.tdTot, s.colIva]}>{formatEuro(totali.preventivatoIva)}</Text>
              <Text style={[s.tdTot, s.colTot]}>{formatEuro(totali.preventivatoTotale)}</Text>
            </View>
          </View>
        )}

        {/* ── Fatture emesse ── */}
        {r.righe_fatture.length > 0 && (
          <View style={s.sezione}>
            <Text style={s.sezioneTitolo}>FATTURE EMESSE</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.colNum]}>DOCUMENTO</Text>
              <Text style={[s.th, s.colData]}>DATA</Text>
              <Text style={[s.th, s.colDesc]}>DESCRIZIONE</Text>
              <Text style={[s.th, s.colImp]}>IMPONIBILE</Text>
              <Text style={[s.th, s.colIva]}>IVA</Text>
              <Text style={[s.th, s.colTot]}>TOTALE</Text>
            </View>
            {r.righe_fatture.map((f, i) => (
              <View key={`${f.numero}-${i}`} style={s.tr}>
                <Text style={[s.td, s.colNum]}>
                  {f.tipo === 'nota_credito' ? `N.C. ${f.numero}` : f.numero}
                </Text>
                <Text style={[s.tdMuted, s.colData]}>{formatData(f.data)}</Text>
                <Text style={[s.tdMuted, s.colDesc]}>
                  {f.tipo === 'nota_credito' ? `Nota di credito – ${f.descrizione}` : f.descrizione}
                </Text>
                <Text style={[s.td, s.colImp]}>{formatEuro(f.imponibile)}</Text>
                <Text style={[s.td, s.colIva]}>{formatEuro(f.iva)}</Text>
                <Text style={[s.td, s.colTot]}>{formatEuro(f.totale)}</Text>
              </View>
            ))}
            <View style={s.trTot}>
              <Text style={[s.tdTot, s.colNum]}>TOTALE</Text>
              <Text style={[s.tdTot, s.colData]} />
              <Text style={[s.tdTot, s.colDesc]}>FATTURATO</Text>
              <Text style={[s.tdTot, s.colImp]}>{formatEuro(totali.fatturatoImponibile)}</Text>
              <Text style={[s.tdTot, s.colIva]}>{formatEuro(totali.fatturatoIva)}</Text>
              <Text style={[s.tdTot, s.colTot]}>{formatEuro(totali.fatturatoTotale)}</Text>
            </View>
            {r.nota_fatture && <Text style={s.notaTabella}>{r.nota_fatture}</Text>}
          </View>
        )}

        {/* ── Incassi ricevuti ── */}
        {incassi.length > 0 && (
          <View style={s.sezione}>
            <Text style={s.sezioneTitolo}>INCASSI RICEVUTI</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.colIncData]}>DATA</Text>
              <Text style={[s.th, s.colIncRif]}>RICEVUTA N.</Text>
              <Text style={[s.th, s.colIncMet]}>MODALITÀ</Text>
              <Text style={[s.th, s.colIncImp]}>IMPORTO</Text>
            </View>
            {incassi.map((inc, i) => (
              <View key={`${inc.riferimento}-${i}`} style={s.tr}>
                <Text style={[s.tdMuted, s.colIncData]}>{formatData(inc.data)}</Text>
                <Text style={[s.td, s.colIncRif]}>{inc.riferimento}</Text>
                <Text style={[s.tdMuted, s.colIncMet]}>{inc.metodo}</Text>
                <Text style={[s.td, s.colIncImp]}>{formatEuro(inc.importo)}</Text>
              </View>
            ))}
            <View style={s.trTot}>
              <Text style={[s.tdTot, s.colIncData]}>TOTALE</Text>
              <Text style={[s.tdTot, s.colIncRif]}>INCASSATO</Text>
              <Text style={[s.tdTot, s.colIncMet]} />
              <Text style={[s.tdTot, s.colIncImp]}>{formatEuro(totali.incassato)}</Text>
            </View>
          </View>
        )}

        {/* ── Situazione contabile ── */}
        <View style={s.sezione}>
          <Text style={s.sezioneTitolo}>SITUAZIONE CONTABILE</Text>
          <View style={s.box}>
            <View style={s.boxRiga}>
              <Text style={s.boxLabel}>Totale fatturato (IVA inclusa)</Text>
              <Text style={s.boxVal}>{formatEuro(totali.fatturatoTotale)}</Text>
            </View>
            <View style={[s.boxRiga, s.boxRigaSep]}>
              <Text style={s.boxLabel}>Totale incassato</Text>
              <Text style={s.boxVal}>– {formatEuro(totali.incassato)}</Text>
            </View>
            <View style={[s.boxRiga, s.boxRigaSep]}>
              <Text style={s.boxLabelBold}>Saldo residuo su fatture emesse</Text>
              <Text style={s.boxValBold}>{formatEuro(totali.saldoResiduoFatture)}</Text>
            </View>
            {mostraNonFatturato && (
              <View style={[s.boxRiga, s.boxRigaSep]}>
                <Text style={s.boxLabel}>
                  Importo preventivato non ancora fatturato – IVA inclusa
                </Text>
                <Text style={s.boxVal}>
                  {totali.preventivatoNonFatturato > 0 ? '+ ' : '– '}
                  {formatEuro(Math.abs(totali.preventivatoNonFatturato))}
                </Text>
              </View>
            )}
            <View style={[s.boxRiga, s.boxRigaSep]}>
              <Text style={s.saldoLabel}>TOTALE A SALDO DELLA COMMESSA</Text>
              <Text style={s.saldoVal}>{formatEuro(totali.totaleASaldo)}</Text>
            </View>
          </View>
        </View>

        {/* ── Nota ── */}
        {haNota && (
          <View style={s.nota}>
            {r.nota_titolo && <Text style={s.notaTitolo}>{r.nota_titolo}</Text>}
            {r.nota_testo && <Text style={s.notaTxt}>{r.nota_testo}</Text>}
          </View>
        )}

        {(r.nota_finale || haCoordinate) && (
          <View style={s.chiusura}>
            {r.nota_finale && <Text>{r.nota_finale}</Text>}
            {haCoordinate && (
              <Text>
                Coordinate per il versamento del saldo:{' '}
                {[settings?.banca, settings?.iban ? `IBAN ${settings.iban}` : null]
                  .filter(Boolean).join(' – ')}
                {settings?.denominazione ? ` – intestato a ${settings.denominazione}` : ''}
              </Text>
            )}
          </View>
        )}

        {/* ── Firme ── */}
        <View style={s.firme}>
          <View style={s.firmaCol}>
            <Text style={s.firmaLabel}>Data ......................................</Text>
            {settings?.denominazione && <Text style={s.firmaNome}>{settings.denominazione}</Text>}
            <View style={s.firmaLinea} />
          </View>
          <View style={s.firmaCol}>
            <Text style={s.firmaLabel}>Per presa visione – Il Cliente</Text>
            <View style={s.firmaLinea} />
          </View>
        </View>

        <Text style={s.piede} fixed>
          {settings?.denominazione ? `${settings.denominazione} – ` : ''}
          Documento riepilogativo privo di valenza fiscale
        </Text>
      </Page>
    </Document>
  )
}
