import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, AccontoCommessa, MetodoPagamento } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'

const TEAL      = '#0E8F9C'
const GRAY_BDR  = '#D1D5DB'
const GRAY_LIGHT = '#F9FAFB'
const GRAY_TEXT = '#6B7280'
const GRAY_MID  = '#9CA3AF'
const TEXT_DARK = '#111827'
const TEXT_MED  = '#374151'
const GREEN     = '#16A34A'
const ORANGE    = '#D97706'

const METODI: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  bonifico: 'Bonifico',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}

function formatData(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: TEXT_DARK,
    paddingHorizontal: 50,
    paddingTop: 45,
    paddingBottom: 45,
    lineHeight: 1.4,
  },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  logo: { height: 44, maxWidth: 110, objectFit: 'contain' },
  denominazione: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 2 },
  infoTxt: { color: GRAY_TEXT, fontSize: 8.5, marginBottom: 1 },
  refLabel: { color: GRAY_MID, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textAlign: 'right', marginBottom: 2 },
  refCode: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: TEXT_MED, textAlign: 'right' },
  separator: { borderBottomWidth: 1, borderBottomColor: GRAY_BDR, marginVertical: 10 },
  separatorLight: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginVertical: 8 },
  // Titolo
  titleLabel: { color: GRAY_MID, fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textAlign: 'center', marginBottom: 3 },
  titleDate: { fontSize: 10, color: GRAY_TEXT, textAlign: 'center' },
  titleDateBold: { fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  // Cliente
  sectionLabel: { color: GRAY_MID, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 3 },
  clienteName: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  // Box importo
  importoBox: {
    borderWidth: 1.5, borderColor: GRAY_BDR, borderRadius: 6,
    backgroundColor: GRAY_LIGHT, padding: 20, alignItems: 'center', marginVertical: 10,
  },
  importoLabel: { color: GRAY_MID, fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 8 },
  importoValue: { fontFamily: 'Helvetica-Bold', fontSize: 28, color: TEXT_DARK, marginBottom: 10 },
  importoMetodoRow: { flexDirection: 'row' as const },
  importoMetodoTxt: { color: GRAY_TEXT, fontSize: 9.5 },
  importoMetodoBold: { fontFamily: 'Helvetica-Bold', color: TEXT_MED, fontSize: 9.5 },
  // Campi info
  fieldLabel: { color: GRAY_MID, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 2 },
  fieldValue: { fontSize: 10, color: TEXT_MED, fontFamily: 'Helvetica-Bold' },
  fieldValueNormal: { fontSize: 10, color: GRAY_TEXT },
  row: { flexDirection: 'row', gap: 32, marginBottom: 8 },
  // Tabella acconti
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BDR, paddingBottom: 3, marginBottom: 2 },
  tableHeaderCell: { color: GRAY_MID, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 3 },
  tableRowCurrent: { backgroundColor: GRAY_LIGHT },
  tableCell: { fontSize: 9, color: GRAY_TEXT },
  tableCellBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEXT_DARK },
  colData: { width: 80 },
  colMetodo: { width: 80 },
  colImporto: { flex: 1, textAlign: 'right' },
  // Riepilogo totali
  totaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  totaleLabel: { fontSize: 9.5, color: GRAY_TEXT },
  totaleValue: { fontSize: 9.5, color: TEXT_MED },
  totaleValueBold: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  saldoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 5, paddingTop: 5,
    borderTopWidth: 1, borderTopColor: GRAY_BDR,
  },
  saldoLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEXT_MED },
  saldoGreen: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GREEN },
  saldoOrange: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: ORANGE },
  // Firma
  firmaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 },
  firmaLabel: { color: GRAY_MID, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 18 },
  firmaLine: { borderBottomWidth: 1, borderBottomColor: '#9CA3AF', width: 140 },
  firmaLineShort: { borderBottomWidth: 1, borderBottomColor: '#9CA3AF', width: 110 },
})

interface Props {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
}

export default function RicevutaPdfDocument({ commessa, acconto, settings, logoUrl }: Props) {
  const ricevutaRef = acconto.id.slice(-6).toUpperCase()

  const accontiSnapshot = commessa.acconti
    .filter((a) => a.created_at <= acconto.created_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const totaleSnapshot = accontiSnapshot.reduce((sum, a) => sum + a.importo, 0)
  const saldoSnapshot = commessa.totale - totaleSnapshot
  const pagato = saldoSnapshot <= 0.005

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            {settings?.denominazione && (
              <Text style={s.denominazione}>{settings.denominazione}</Text>
            )}
            {(settings?.indirizzo || settings?.piva) && (
              <Text style={s.infoTxt}>
                {[settings.indirizzo, settings.piva ? `P.IVA ${settings.piva}` : null]
                  .filter(Boolean).join(' — ')}
              </Text>
            )}
            {(settings?.telefono || settings?.email) && (
              <Text style={s.infoTxt}>
                {[settings.telefono, settings.email].filter(Boolean).join(' — ')}
              </Text>
            )}
          </View>
          <View>
            <Text style={s.refLabel}>RIF.</Text>
            <Text style={s.refCode}>{ricevutaRef}</Text>
          </View>
        </View>

        <View style={s.separator} />

        {/* Titolo */}
        <Text style={s.titleLabel}>RICEVUTA DI PAGAMENTO</Text>
        <Text style={s.titleDate}>
          Data: <Text style={s.titleDateBold}>{formatData(acconto.data_pagamento)}</Text>
        </Text>

        <View style={s.separatorLight} />

        {/* Cliente */}
        <View style={{ marginBottom: 8 }}>
          <Text style={s.sectionLabel}>CLIENTE</Text>
          <Text style={s.clienteName}>{commessa.cliente_nome}</Text>
        </View>

        {/* Box importo */}
        <View style={s.importoBox}>
          <Text style={s.importoLabel}>SI DICHIARA DI AVER RICEVUTO LA SOMMA DI</Text>
          <Text style={s.importoValue}>{formatEuro(acconto.importo)}</Text>
          <View style={s.importoMetodoRow}>
            <Text style={s.importoMetodoTxt}>Metodo di pagamento: </Text>
            <Text style={s.importoMetodoBold}>
              {METODI[acconto.metodo_pagamento] ?? acconto.metodo_pagamento}
            </Text>
          </View>
        </View>

        {/* Commessa / Preventivo */}
        {(commessa.numero_commessa || commessa.numero_preventivo) && (
          <View style={s.row}>
            {commessa.numero_commessa && (
              <View>
                <Text style={s.fieldLabel}>N. COMMESSA</Text>
                <Text style={s.fieldValue}>{commessa.numero_commessa}</Text>
              </View>
            )}
            {commessa.numero_preventivo && (
              <View>
                <Text style={s.fieldLabel}>N. PREVENTIVO</Text>
                <Text style={s.fieldValue}>{commessa.numero_preventivo}</Text>
              </View>
            )}
          </View>
        )}

        {/* Note commessa */}
        {commessa.note && (
          <View style={{ marginBottom: 8 }}>
            <Text style={s.fieldLabel}>DESCRIZIONE LAVORI</Text>
            <Text style={s.fieldValueNormal}>{commessa.note}</Text>
          </View>
        )}

        {/* Note acconto */}
        {acconto.note && (
          <View style={{ marginBottom: 8 }}>
            <Text style={s.fieldLabel}>NOTE PAGAMENTO</Text>
            <Text style={s.fieldValueNormal}>{acconto.note}</Text>
          </View>
        )}

        {/* Riepilogo acconti */}
        <View style={{ marginTop: 4 }}>
          <Text style={[s.sectionLabel, { marginBottom: 6 }]}>RIEPILOGO PAGAMENTI</Text>
          {accontiSnapshot.length > 1 && (
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, s.colData]}>Data</Text>
                <Text style={[s.tableHeaderCell, s.colMetodo]}>Metodo</Text>
                <Text style={[s.tableHeaderCell, s.colImporto]}>Importo</Text>
              </View>
              {accontiSnapshot.map((a) => (
                <View key={a.id} style={[s.tableRow, a.id === acconto.id ? s.tableRowCurrent : {}]}>
                  <Text style={[a.id === acconto.id ? s.tableCellBold : s.tableCell, s.colData]}>
                    {formatData(a.data_pagamento)}
                  </Text>
                  <Text style={[a.id === acconto.id ? s.tableCellBold : s.tableCell, s.colMetodo]}>
                    {METODI[a.metodo_pagamento] ?? a.metodo_pagamento}
                  </Text>
                  <Text style={[a.id === acconto.id ? s.tableCellBold : s.tableCell, s.colImporto]}>
                    {formatEuro(a.importo)}{a.id === acconto.id ? ' ←' : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.totaleRow}>
            <Text style={s.totaleLabel}>Totale lavori</Text>
            <Text style={s.totaleValue}>{formatEuro(commessa.totale)}</Text>
          </View>
          <View style={s.totaleRow}>
            <Text style={s.totaleLabel}>Totale ricevuto</Text>
            <Text style={s.totaleValueBold}>{formatEuro(totaleSnapshot)}</Text>
          </View>
          <View style={s.saldoRow}>
            <Text style={s.saldoLabel}>Saldo rimanente</Text>
            <Text style={pagato ? s.saldoGreen : s.saldoOrange}>{formatEuro(saldoSnapshot)}</Text>
          </View>
        </View>

        <View style={[s.separator, { marginTop: 20 }]} />

        {/* Firma */}
        <View style={s.firmaRow}>
          <View>
            <Text style={s.firmaLabel}>FIRMA DEL RICEVENTE</Text>
            <View style={s.firmaLine} />
          </View>
          <View>
            <Text style={[s.firmaLabel, { textAlign: 'right' }]}>DATA E LUOGO</Text>
            <View style={s.firmaLineShort} />
          </View>
        </View>

      </Page>
    </Document>
  )
}
