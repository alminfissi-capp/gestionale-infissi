'use client'

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import type { OrdineCompleto } from '@/types/produzione'

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  titolo: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  riga: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
  intestazioneTabella: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  colCodice: { flex: 1.6 },
  colDesc: { flex: 3.2 },
  colFinitura: { flex: 1.6 },
  colQta: { flex: 0.9, textAlign: 'right' },
  colUm: { flex: 0.9, textAlign: 'center' },
  colPrezzo: { flex: 1.3, textAlign: 'right' },
  colTot: { flex: 1.3, textAlign: 'right' },
  blocco: { marginBottom: 12 },
  grassetto: { fontFamily: 'Helvetica-Bold' },
  totale: { marginTop: 10, textAlign: 'right', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 16, color: '#444' },
})

export type IntestazionePDF = { denominazione: string; indirizzo: string; piva: string }

interface Props {
  ordine: OrdineCompleto
  intestazione: IntestazionePDF
  fornitoreNome: string
  numeroCommessa: string
  clienteNome: string
}

export default function OrdinePDF({
  ordine, intestazione, fornitoreNome, numeroCommessa, clienteNome,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.blocco}>
          <Text style={styles.grassetto}>{intestazione.denominazione}</Text>
          {intestazione.indirizzo ? <Text>{intestazione.indirizzo}</Text> : null}
          {intestazione.piva ? <Text>P.IVA {intestazione.piva}</Text> : null}
        </View>

        <Text style={styles.titolo}>Ordine fornitore {ordine.numero_ordine}</Text>

        <View style={styles.blocco}>
          <Text><Text style={styles.grassetto}>Fornitore: </Text>{fornitoreNome}</Text>
          <Text><Text style={styles.grassetto}>Data ordine: </Text>{ordine.data_ordine}</Text>
          {ordine.data_consegna_prevista ? (
            <Text><Text style={styles.grassetto}>Consegna prevista: </Text>{ordine.data_consegna_prevista}</Text>
          ) : null}
          <Text><Text style={styles.grassetto}>Commessa: </Text>{numeroCommessa} — {clienteNome}</Text>
        </View>

        <View style={styles.intestazioneTabella}>
          <Text style={styles.colCodice}>Cod. Articolo</Text>
          <Text style={styles.colDesc}>Descrizione</Text>
          <Text style={styles.colFinitura}>Finitura</Text>
          <Text style={styles.colQta}>Q.tà</Text>
          <Text style={styles.colUm}>U.M.</Text>
          <Text style={styles.colPrezzo}>Prezzo</Text>
          <Text style={styles.colTot}>Totale</Text>
        </View>

        {ordine.righe.map((r) => (
          <View key={r.id} style={styles.riga}>
            <Text style={styles.colCodice}>{r.codice_articolo || '—'}</Text>
            <Text style={styles.colDesc}>{r.descrizione}</Text>
            <Text style={styles.colFinitura}>{r.finitura || '—'}</Text>
            <Text style={styles.colQta}>{r.quantita}</Text>
            <Text style={styles.colUm}>{r.unita_misura}</Text>
            <Text style={styles.colPrezzo}>
              {r.prezzo_unitario === null ? '—' : formatEuro(r.prezzo_unitario)}
            </Text>
            <Text style={styles.colTot}>
              {r.prezzo_unitario === null ? '—' : formatEuro(r.quantita * r.prezzo_unitario)}
            </Text>
          </View>
        ))}

        <Text style={styles.totale}>Totale: {formatEuro(ordine.totale)}</Text>

        {ordine.note ? <Text style={styles.note}>{ordine.note}</Text> : null}
      </Page>
    </Document>
  )
}
