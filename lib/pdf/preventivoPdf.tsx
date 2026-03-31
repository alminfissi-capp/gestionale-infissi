import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { formatEuro } from '@/lib/pricing'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

// ─── Colori e costanti ────────────────────────────────────────────────────────
const GRAY_BORDER = '#d1d5db'
const GRAY_LIGHT  = '#f9fafb'
const GRAY_TEXT   = '#6b7280'
const GRAY_MID    = '#9ca3af'
const GREEN       = '#16a34a'
const AMBER       = '#d97706'
const TEXT_DARK   = '#111827'
const TEXT_MED    = '#374151'

// Margini pagina: 15mm verticali, 18mm orizzontali (come @page del CSS)
const PH = 51  // ~18mm in pt
const PV = 43  // ~15mm in pt

// ─── Stili ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: TEXT_DARK,
    paddingHorizontal: PH,
    paddingTop: PV,
    paddingBottom: PV + 22,
    lineHeight: 1.4,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    marginBottom: 5,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 8 },
  logo:       { height: 56, maxWidth: 120, objectFit: 'contain' },
  coName:     { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 2 },
  coInfo:     { color: GRAY_TEXT, fontSize: 8.5, marginBottom: 1 },
  headerRight:{ minWidth: 140 },
  clName:     { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 2, textAlign: 'right' },
  clInfo:     { color: GRAY_TEXT, fontSize: 8.5, marginBottom: 1, textAlign: 'right' },

  // ── Titolo ──
  titleSection: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 12, letterSpacing: 0.4 },

  // ── Metadati ──
  meta: {
    flexDirection: 'row',
    gap: 24,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    marginBottom: 4,
    color: GRAY_TEXT,
    fontSize: 8.5,
  },
  metaBold: { fontFamily: 'Helvetica-Bold', color: TEXT_MED },

  // ── Intro ──
  intro: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    marginBottom: 4,
    color: GRAY_TEXT,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Oblique',
  },

  // ── Tabella: colonne (larghezza totale contenuto ~493pt) ──
  tHead: {
    flexDirection: 'row',
    backgroundColor: GRAY_LIGHT,
    borderBottomWidth: 2,
    borderBottomColor: '#9ca3af',
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 5,
    fontSize: 8.5,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 5,
    alignItems: 'flex-start',
  },
  cNum:   { width: 22,  textAlign: 'center', color: GRAY_TEXT, fontFamily: 'Courier', fontSize: 8 },
  cDesc:  { flex: 1,    paddingRight: 6 },
  cL:     { width: 42,  textAlign: 'right',  color: GRAY_TEXT },
  cA:     { width: 42,  textAlign: 'right',  color: GRAY_TEXT },
  cPrice: { width: 68,  textAlign: 'right' },
  cQty:   { width: 24,  textAlign: 'center' },
  cTot:   { width: 72,  textAlign: 'right',  fontFamily: 'Helvetica-Bold' },

  // Descrizione articolo
  artName:     { fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  artSub:      { color: GRAY_MID, fontSize: 8, marginTop: 1 },
  artAmber:    { color: AMBER, fontSize: 8, marginTop: 1 },
  artStrike:   { color: GRAY_MID, fontSize: 8, textDecoration: 'line-through' },
  artGreen:    { color: GREEN, fontSize: 8 },

  // ── Totali ──
  totalsSection: {
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#9ca3af',
    paddingTop: 10,
  },
  totalsInner: { marginLeft: 'auto', width: 210 },
  totRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, color: TEXT_MED, fontSize: 9 },
  totRowGreen: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, color: GREEN, fontSize: 9 },
  totRowBold:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  totRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: GRAY_BORDER,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },

  // ── Note ──
  notesSection: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 6 },
  notesLabel:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GRAY_MID, marginBottom: 3 },
  notesText:    { fontSize: 8.5, color: TEXT_MED },

  // ── Footer fisso ──
  footer: {
    position: 'absolute',
    bottom: 15,
    left: PH,
    right: PH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: GRAY_BORDER,
    paddingTop: 4,
    fontSize: 7.5,
    color: GRAY_TEXT,
  },
})

// ─── Componente ───────────────────────────────────────────────────────────────
interface Props {
  preventivo: PreventivoCompleto
  settings: Settings | null
  logoUrl: string | null
}

export default function PreventivoPdf({ preventivo: p, settings, logoUrl }: Props) {
  const cs = p.cliente_snapshot
  const nomeCliente = cs.tipo === 'azienda'
    ? cs.ragione_sociale || cs.email || cs.telefono || '—'
    : [cs.nome, cs.cognome].filter(Boolean).join(' ') || cs.email || cs.telefono || '—'

  const dataFormattata = new Date(p.created_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const titolo = p.numero ? `Offerta N. ${p.numero}` : 'Preventivo'
  const mostraSconto = p.mostra_sconto_riga
  const articoliOrdinati = [...p.articoli].sort((a, b) => a.ordine - b.ordine)

  const indirizzoCliente = cs.via
    ? [cs.via + (cs.civico ? ` ${cs.civico}` : ''), cs.cap, cs.citta, cs.provincia].filter(Boolean).join(', ')
    : cs.indirizzo || null

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {logoUrl && <Image src={logoUrl} style={s.logo} />}
            <View>
              {settings?.denominazione && <Text style={s.coName}>{settings.denominazione}</Text>}
              {settings?.indirizzo     && <Text style={s.coInfo}>{settings.indirizzo}</Text>}
              {(settings?.piva || settings?.codice_fiscale) && (
                <Text style={s.coInfo}>
                  {[settings.piva && `P.IVA ${settings.piva}`, settings.codice_fiscale && `CF ${settings.codice_fiscale}`].filter(Boolean).join(' · ')}
                </Text>
              )}
              {(settings?.telefono || settings?.email) && (
                <Text style={s.coInfo}>
                  {[settings.telefono && `Tel. ${settings.telefono}`, settings.email].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.clName}>{nomeCliente}</Text>
            {indirizzoCliente && <Text style={s.clInfo}>{indirizzoCliente}</Text>}
            {cs.nazione     && <Text style={s.clInfo}>{cs.nazione}</Text>}
            {cs.codice_sdi  && <Text style={s.clInfo}>SDI: {cs.codice_sdi}</Text>}
            {cs.cf_piva     && <Text style={s.clInfo}>CF/P.IVA: {cs.cf_piva}</Text>}
            {cs.telefono    && <Text style={s.clInfo}>Tel. {cs.telefono}</Text>}
            {cs.email       && <Text style={s.clInfo}>{cs.email}</Text>}
            {cs.cantiere    && <Text style={{ ...s.clInfo, fontSize: 8 }}>Cantiere: {cs.cantiere}</Text>}
          </View>
        </View>

        {/* ── Titolo ── */}
        <View style={s.titleSection}>
          <Text style={s.title}>{titolo}</Text>
        </View>

        {/* ── Metadati ── */}
        <View style={s.meta}>
          {p.numero && (
            <Text><Text style={s.metaBold}>N. preventivo: </Text>{p.numero}</Text>
          )}
          <Text><Text style={s.metaBold}>Data: </Text>{dataFormattata}</Text>
        </View>

        {/* ── Intro ── */}
        <View style={s.intro}>
          <Text>Le proponiamo la nostra migliore offerta per i seguenti prodotti e servizi.</Text>
        </View>

        {/* ── Intestazione tabella ── */}
        <View style={s.tHead}>
          <Text style={s.cNum}>#</Text>
          <Text style={s.cDesc}>Descrizione</Text>
          <Text style={s.cL}>L (mm)</Text>
          <Text style={s.cA}>A (mm)</Text>
          <Text style={s.cPrice}>P. Unit.</Text>
          <Text style={s.cQty}>Qtà</Text>
          <Text style={s.cTot}>P. Totale</Text>
        </View>

        {/* ── Righe articoli ── */}
        {articoliOrdinati.map((a, i) => {
          const quotaTrasporto  = p.modalita_trasporto === 'ripartito' ? (a.quota_trasporto ?? 0) : 0
          const quotaUnitaria   = a.quantita > 0 ? quotaTrasporto / a.quantita : 0
          const prezzoNetUnit   = a.sconto_articolo > 0
            ? a.prezzo_unitario * (1 - a.sconto_articolo / 100)
            : a.prezzo_unitario
          const prezzoTotDisplay = a.prezzo_totale_riga + quotaTrasporto

          const accessories = [
            ...(a.accessori_griglia ?? []).map(acc => acc.nome),
            ...(a.accessori_selezionati ?? []).map(acc => acc.qty > 1 ? `${acc.nome} ×${acc.qty}` : acc.nome),
          ]

          return (
            <View key={a.id} style={s.tRow} wrap={false}>
              <Text style={s.cNum}>{String(i + 1).padStart(2, '0')}</Text>

              <View style={s.cDesc}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                  {a.immagine_url && (
                    <Image src={a.immagine_url} style={{ width: 38, height: 38, objectFit: 'contain' }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.artName}>{a.tipologia}</Text>
                    {a.categoria_nome && <Text style={s.artSub}>{a.categoria_nome}</Text>}
                    {a.finitura_nome  && <Text style={s.artSub}>Finitura: {a.finitura_nome}</Text>}
                    {accessories.length > 0 && (
                      <Text style={{ ...s.artSub, color: GRAY_TEXT }}>{accessories.join(' · ')}</Text>
                    )}
                    {a.misura_arrotondata && a.larghezza_listino_mm != null && (
                      <Text style={s.artAmber}>
                        misura arrotondata a {a.larghezza_listino_mm}×{a.altezza_listino_mm}
                      </Text>
                    )}
                    {a.note && <Text style={{ ...s.artSub, fontFamily: 'Helvetica-Oblique' }}>{a.note}</Text>}
                  </View>
                </View>
              </View>

              <Text style={s.cL}>{a.tipo === 'libera' ? '—' : (a.larghezza_mm ?? '—')}</Text>
              <Text style={s.cA}>{a.tipo === 'libera' ? '—' : (a.altezza_mm ?? '—')}</Text>

              <View style={s.cPrice}>
                {mostraSconto && a.sconto_articolo > 0 ? (
                  <>
                    <Text style={s.artStrike}>€ {formatEuro(a.prezzo_unitario + quotaUnitaria)}</Text>
                    <Text>€ {formatEuro(prezzoNetUnit + quotaUnitaria)}</Text>
                    <Text style={s.artGreen}>−{a.sconto_articolo}%</Text>
                  </>
                ) : (
                  <Text>€ {formatEuro(prezzoNetUnit + quotaUnitaria)}</Text>
                )}
              </View>

              <Text style={s.cQty}>{a.quantita}</Text>
              <Text style={s.cTot}>€ {formatEuro(prezzoTotDisplay)}</Text>
            </View>
          )
        })}

        {/* ── Totali ── */}
        <View style={s.totalsSection}>
          <View style={s.totalsInner}>
            {((p.modalita_trasporto === 'ripartito' && p.sconto_globale > 0) ||
              (p.modalita_trasporto === 'separato'  && (p.sconto_globale > 0 || p.spese_trasporto > 0))) && (
              <View style={s.totRow}>
                <Text>Subtotale ({p.totale_pezzi} pz)</Text>
                <Text>€ {formatEuro(
                  p.modalita_trasporto === 'ripartito'
                    ? p.subtotale + p.spese_trasporto
                    : p.subtotale
                )}</Text>
              </View>
            )}
            {p.sconto_globale > 0 && (
              <View style={s.totRowGreen}>
                <Text>Sconto {p.sconto_globale}%</Text>
                <Text>− € {formatEuro(p.importo_sconto)}</Text>
              </View>
            )}
            <View style={s.totRowBold}>
              <Text>
                {p.sconto_globale > 0 || (p.modalita_trasporto === 'separato' && p.spese_trasporto > 0)
                  ? 'Totale imponibile'
                  : `Imponibile (${p.totale_pezzi} pz)`}
              </Text>
              <Text>€ {formatEuro(p.totale_articoli)}</Text>
            </View>
            {p.riepilogo_iva.map((r) => (
              <View key={r.aliquota} style={{ ...s.totRow, color: GRAY_TEXT }}>
                <Text>IVA {r.aliquota}%</Text>
                <Text>€ {formatEuro(r.iva)}</Text>
              </View>
            ))}
            {p.iva_totale > 0 && p.riepilogo_iva.length > 1 && (
              <View style={{ ...s.totRow, color: GRAY_TEXT }}>
                <Text>Totale IVA</Text>
                <Text>€ {formatEuro(p.iva_totale)}</Text>
              </View>
            )}
            {p.modalita_trasporto === 'separato' && (
              <View style={{ ...s.totRow, color: GRAY_TEXT }}>
                <Text>Spese trasporto</Text>
                <Text>€ {formatEuro(p.spese_trasporto)}</Text>
              </View>
            )}
            <View style={s.totRowFinal}>
              <Text>TOTALE FINALE</Text>
              <Text>€ {formatEuro(p.totale_finale)}</Text>
            </View>
          </View>
        </View>

        {/* ── Note ── */}
        {p.note && (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>NOTE</Text>
            <Text style={s.notesText}>{p.note}</Text>
          </View>
        )}

        {/* ── Footer fisso ── */}
        <View style={s.footer} fixed>
          <Text>Data: {dataFormattata}</Text>
          {p.numero && <Text>{p.numero}</Text>}
          {settings?.denominazione && <Text>{settings.denominazione}</Text>}
        </View>
      </Page>
    </Document>
  )
}
