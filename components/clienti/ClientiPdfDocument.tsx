import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { Cliente } from '@/types/cliente'

const TEAL        = '#0E8F9C'
const GRAY_BORDER = '#E5E7EB'
const GRAY_LIGHT  = '#F9FAFB'
const GRAY_TEXT   = '#6B7280'
const TEXT_DARK   = '#111827'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: TEXT_DARK,
    paddingHorizontal: 30,
    paddingTop: 35,
    paddingBottom: 50,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  denominazione: { fontFamily: 'Helvetica-Bold', fontSize: 13 },
  headerDate:    { color: GRAY_TEXT, fontSize: 8.5 },
  subtitle:      { color: GRAY_TEXT, fontSize: 9, marginBottom: 2 },
  count: {
    color: GRAY_TEXT,
    fontSize: 8.5,
    paddingBottom: 7,
    marginBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: TEAL,
  },
  rowAlt: { backgroundColor: GRAY_LIGHT },
  hCell: {
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
  },
  colNome:      { width: 132 },
  colTipo:      { width: 40 },
  colTel:       { width: 72 },
  colEmail:     { width: 110 },
  colIndirizzo: { width: 111 },
  colCf:        { width: 70 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerText: { color: GRAY_TEXT, fontSize: 7.5 },
})

function nomeCliente(c: Cliente): string {
  if (c.tipo === 'azienda') return c.ragione_sociale || '—'
  return [c.nome, c.cognome].filter(Boolean).join(' ') || '—'
}

function formatIndirizzo(c: Cliente): string {
  const linea1 = [c.via, c.civico].filter(Boolean).join(' ')
  const linea2 = [c.cap, c.citta].filter(Boolean).join(' ')
  const prov   = c.provincia ? `(${c.provincia})` : null
  return [linea1, [linea2, prov].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'
}

interface Props {
  clienti:        Cliente[]
  denominazione:  string
  totaleClienti:  number
  dataGenerazione: string
}

export default function ClientiPdfDocument({ clienti, denominazione, totaleClienti, dataGenerazione }: Props) {
  const filtrati = clienti.length !== totaleClienti

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.denominazione}>{denominazione}</Text>
          <Text style={s.headerDate}>{dataGenerazione}</Text>
        </View>
        <Text style={s.subtitle}>Elenco Clienti</Text>
        <Text style={s.count}>
          {filtrati
            ? `${clienti.length} di ${totaleClienti} clienti (risultati filtrati)`
            : `Tot. ${totaleClienti} client${totaleClienti === 1 ? 'e' : 'i'}`}
        </Text>

        {/* Intestazione tabella */}
        <View style={s.tableHeaderRow}>
          <Text style={[s.hCell, s.colNome]}>Nome / Ragione sociale</Text>
          <Text style={[s.hCell, s.colTipo]}>Tipo</Text>
          <Text style={[s.hCell, s.colTel]}>Telefono</Text>
          <Text style={[s.hCell, s.colEmail]}>Email</Text>
          <Text style={[s.hCell, s.colIndirizzo]}>Indirizzo</Text>
          <Text style={[s.hCell, s.colCf]}>CF / P.IVA</Text>
        </View>

        {/* Righe */}
        {clienti.map((c, i) => (
          <View key={c.id} style={[s.tableRow, i % 2 !== 0 ? s.rowAlt : {}]} wrap={false}>
            <Text style={[s.cell, s.colNome]}>{nomeCliente(c)}</Text>
            <Text style={[s.cell, s.colTipo]}>{c.tipo === 'azienda' ? 'Azienda' : 'Privato'}</Text>
            <Text style={[s.cell, s.colTel]}>{c.telefono || '—'}</Text>
            <Text style={[s.cell, s.colEmail]}>{c.email || '—'}</Text>
            <Text style={[s.cell, s.colIndirizzo]}>{formatIndirizzo(c)}</Text>
            <Text style={[s.cell, s.colCf]}>{c.cf_piva || '—'}</Text>
          </View>
        ))}

        {/* Footer numerazione pagine */}
        <Text
          style={s.footer}
          render={({ pageNumber, totalPages }) => (
            <Text style={s.footerText}>Pagina {pageNumber} di {totalPages}</Text>
          )}
          fixed
        />
      </Page>
    </Document>
  )
}
