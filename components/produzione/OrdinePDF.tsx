'use client'

import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { isModificatoDopoInvio, righeFooterPdf } from '@/lib/produzione-tracking'
import type { OrdineCompleto, TrackingOrdine } from '@/types/produzione'

// Niente sillabazione automatica: spezzava le sigle a metà, e "100x100x2
// Zincato" finiva su tre righe come "100" / "x100x2 Zinca-" / "to".
// Le parole troppo lunghe per la cella vanno semplicemente a capo intere.
Font.registerHyphenationCallback((parola) => [parola])

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 64, fontSize: 10, fontFamily: 'Helvetica' },
  intestazioneAzienda: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  logo: { height: 48, maxWidth: 130, objectFit: 'contain' },
  titolo: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  // Niente gap uniforme: lo stacco serve dove le colonne rischiano di
  // confondersi. Largo dopo la descrizione, minimo fra finitura e quantita',
  // che si leggono bene accostate e liberano spazio per il testo lungo.
  riga: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
  intestazioneTabella: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  // Il codice articolo va in corpo piu' piccolo: sigle come
  // "100x100x2 Zincato" a 10pt si spezzavano su tre righe.
  colCodice: { flex: 1.8, marginRight: 6, fontSize: 8 },
  colDesc: { flex: 5.2, marginRight: 14 },
  colFinitura: { flex: 1.2, marginRight: 3 },
  colQta: { flex: 0.6, marginRight: 6, textAlign: 'right' },
  colUm: { flex: 0.8, marginRight: 6, textAlign: 'center' },
  colPrezzo: { flex: 1.2, marginRight: 8, textAlign: 'right' },
  colTot: { flex: 1.2, textAlign: 'right' },
  blocco: { marginBottom: 12 },
  grassetto: { fontFamily: 'Helvetica-Bold' },
  totale: { marginTop: 10, textAlign: 'right', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 16, color: '#444' },
  piePagina: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 6,
    fontSize: 8,
    color: '#666',
  },
})

export type IntestazionePDF = {
  denominazione: string
  indirizzo: string
  piva: string
  logoUrl: string | null
}

interface Props {
  ordine: OrdineCompleto
  intestazione: IntestazionePDF
  fornitoreNome: string
  numeroCommessa: string
  clienteNome: string
  /** Ricevuta di consegna: assente finché l'ordine non è stato inviato. */
  tracking?: TrackingOrdine
}

export default function OrdinePDF({
  ordine, intestazione, fornitoreNome, numeroCommessa, clienteNome, tracking,
}: Props) {
  const modificato = isModificatoDopoInvio(
    ordine.righe.map((r) => r.created_at),
    tracking?.inviatoAt ?? null
  )
  const righeFooter = tracking ? righeFooterPdf(tracking, modificato) : []
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.intestazioneAzienda}>
          {intestazione.logoUrl ? <Image src={intestazione.logoUrl} style={styles.logo} /> : null}
          <View>
            <Text style={styles.grassetto}>{intestazione.denominazione}</Text>
            {intestazione.indirizzo ? <Text>{intestazione.indirizzo}</Text> : null}
            {intestazione.piva ? <Text>P.IVA {intestazione.piva}</Text> : null}
          </View>
        </View>

        <Text style={styles.titolo}>Ordine fornitore {formattaNumeroOrdine(ordine.numero_ordine)}</Text>

        <View style={styles.blocco}>
          <Text><Text style={styles.grassetto}>Fornitore: </Text>{fornitoreNome}</Text>
          <Text><Text style={styles.grassetto}>Data ordine: </Text>{ordine.data_ordine}</Text>
          {ordine.data_consegna_prevista ? (
            <Text><Text style={styles.grassetto}>Consegna prevista: </Text>{ordine.data_consegna_prevista}</Text>
          ) : null}
          <Text>
            <Text style={styles.grassetto}>Commessa: </Text>
            {clienteNome ? `${numeroCommessa} — ${clienteNome}` : numeroCommessa}
          </Text>
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

        {righeFooter.length > 0 ? (
          <View style={styles.piePagina} fixed>
            {righeFooter.map((riga) => (
              <Text key={riga}>{riga}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
