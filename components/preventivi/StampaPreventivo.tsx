'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Printer, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'
import AllegatoCatalogoPdf from '@/components/preventivi/AllegatoCatalogoPdf'

interface Props {
  preventivo: PreventivoCompleto
  settings: Settings | null
  logoUrl: string | null
  showBack?: boolean
}

export default function StampaPreventivo({ preventivo: p, settings, logoUrl, showBack = true }: Props) {
  const s = p.cliente_snapshot
  const nomeCliente = s.tipo === 'azienda'
    ? s.ragione_sociale || s.email || s.telefono || '—'
    : [s.nome, s.cognome].filter(Boolean).join(' ') || s.email || s.telefono || '—'
  const dataFormattata = new Date(p.created_at).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const titolo = p.numero ? `Offerta N. ${p.numero}` : 'Preventivo'

  useEffect(() => {
    const prev = document.title
    document.title = p.numero ? `${p.numero} ${nomeCliente}` : nomeCliente
    return () => { document.title = prev }
  }, [p.numero, nomeCliente])

  return (
    <>
      {/* Toolbar — solo schermo */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        {showBack && (
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={`/preventivi/${p.id}`}>
              <ChevronLeft className="h-4 w-4" />
              Torna al preventivo
            </Link>
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa / Salva PDF
        </Button>
        <p className="text-xs text-gray-400">
          Per rimuovere l&apos;URL in fondo, nella finestra di stampa disabilita <em>Intestazioni e piè di pagina</em>
        </p>
      </div>

      {/* Sfondo grigio schermo — nascosto in stampa */}
      <div className="print:hidden bg-gray-100 min-h-screen py-8 px-4">
        <DocumentoA4
          p={p}
          s={s}
          nomeCliente={nomeCliente}
          dataFormattata={dataFormattata}
          titolo={titolo}
          settings={settings}
          logoUrl={logoUrl}
        />
      </div>

      {/* Documento puro per la stampa */}
      <div className="hidden print:block">
        <DocumentoA4
          p={p}
          s={s}
          nomeCliente={nomeCliente}
          dataFormattata={dataFormattata}
          titolo={titolo}
          settings={settings}
          logoUrl={logoUrl}
        />
      </div>
    </>
  )
}

// ─── Documento A4 ────────────────────────────────────────────────────────────

interface DocProps {
  p: PreventivoCompleto
  s: PreventivoCompleto['cliente_snapshot']
  nomeCliente: string
  dataFormattata: string
  titolo: string
  settings: Settings | null
  logoUrl: string | null
}

function DocumentoA4({ p, s, nomeCliente, dataFormattata, titolo, settings, logoUrl }: DocProps) {
  const articoliOrdinati = [...p.articoli].sort((a, b) => a.ordine - b.ordine)

  return (
    <div
      className="
        bg-white text-gray-900 text-[11px] leading-relaxed
        max-w-[794px] mx-auto
        print:max-w-none print:mx-0 print:shadow-none print:w-full
        shadow-lg
      "
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', minWidth: 0 }}
    >
      {/* ── Intestazione ── */}
      <div className="flex justify-between gap-4 p-8 print:p-0 pb-4 border-b border-gray-300">
        {/* Colonna azienda */}
        <div className="flex items-start gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo azienda"
              style={{ height: '80px', width: 'auto', objectFit: 'contain' }}
            />
          )}
          <div>
            {settings?.denominazione && (
              <p className="font-bold text-base mb-0.5">{settings.denominazione}</p>
            )}
            {settings?.indirizzo && <p className="text-gray-600">{settings.indirizzo}</p>}
            {(settings?.piva || settings?.codice_fiscale) && (
              <p className="text-gray-600">
                {settings.piva && `P.IVA ${settings.piva}`}
                {settings.piva && settings.codice_fiscale && ' · '}
                {settings.codice_fiscale && `CF ${settings.codice_fiscale}`}
              </p>
            )}
            {(settings?.telefono || settings?.email) && (
              <p className="text-gray-600">
                {settings.telefono && `Tel. ${settings.telefono}`}
                {settings.telefono && settings.email && ' · '}
                {settings.email}
              </p>
            )}
          </div>
        </div>

        {/* Colonna cliente */}
        <div className="text-right min-w-[180px]">
          <p className="font-semibold text-sm">{nomeCliente}</p>
          {(s.via || s.indirizzo) && (
            <p className="text-gray-600">
              {s.via
                ? [s.via + (s.civico ? ` ${s.civico}` : ''), s.cap, s.citta, s.provincia].filter(Boolean).join(', ')
                : s.indirizzo
              }
            </p>
          )}
          {s.nazione && <p className="text-gray-600">{s.nazione}</p>}
          {s.codice_sdi && <p className="text-gray-600">SDI: {s.codice_sdi}</p>}
          {s.cf_piva && <p className="text-gray-600">CF/P.IVA: {s.cf_piva}</p>}
          {s.telefono && <p className="text-gray-600">Tel. {s.telefono}</p>}
          {s.email && <p className="text-gray-600">{s.email}</p>}
          {s.cantiere && <p className="text-gray-500 text-[10px] mt-1">Cantiere: {s.cantiere}</p>}
        </div>
      </div>

      {/* ── Titolo preventivo ── */}
      <div className="px-8 print:px-0 py-3 border-b border-gray-300">
        <p className="text-center font-bold text-[13px] tracking-wide">{titolo}</p>
      </div>

      {/* ── Metadati ── */}
      <div className="px-8 print:px-0 py-2 border-b border-gray-300 flex gap-8 text-[10px] text-gray-500">
        {p.numero && (
          <span>
            <span className="font-semibold text-gray-700">N. preventivo:</span> {p.numero}
          </span>
        )}
        <span>
          <span className="font-semibold text-gray-700">Data:</span> {dataFormattata}
        </span>
      </div>

      {/* ── Testo introduttivo ── */}
      <div className="px-8 print:px-0 py-3 border-b border-gray-300 text-[10px] text-gray-600 italic">
        Le proponiamo la nostra migliore offerta per i seguenti serramenti.
      </div>

      {/* ── Tabella articoli (div-grid per break-inside affidabile in Chromium) ── */}
      <div className="px-8 print:px-0 text-[10px]">
        {/* Intestazione colonne */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 52px 52px 76px 32px 88px',
            borderBottom: '2px solid #9ca3af',
            background: '#f9fafb',
            fontWeight: 600,
            padding: '6px 0',
          }}
        >
          <div style={{ textAlign: 'center' }}>#</div>
          <div>Descrizione</div>
          <div style={{ textAlign: 'right' }}>L (mm)</div>
          <div style={{ textAlign: 'right' }}>A (mm)</div>
          <div style={{ textAlign: 'right' }}>P. Unit.</div>
          <div style={{ textAlign: 'center' }}>Qtà</div>
          <div style={{ textAlign: 'right' }}>P. Totale</div>
        </div>

        {/* Righe articoli */}
        {articoliOrdinati.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 52px 52px 76px 32px 88px',
              borderBottom: '1px solid #e5e7eb',
              alignItems: 'start',
              padding: '6px 0',
              breakInside: 'avoid',
              pageBreakInside: 'avoid',
            }}
          >
            {/* Numero */}
            <div style={{ textAlign: 'center', color: '#6b7280', fontFamily: 'monospace', paddingTop: '2px' }}>
              {String(i + 1).padStart(2, '0')}
            </div>

            {/* Descrizione */}
            <div style={{ paddingRight: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {a.immagine_url && (
                  <div style={{ width: '56px', height: '56px', flexShrink: 0, overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: '2px', background: '#f9fafb' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.immagine_url}
                      alt={a.tipologia}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                )}
                <div>
                  <p style={{ fontWeight: 600, fontSize: '11px', margin: 0, wordBreak: 'break-word', ...(a.tipo === 'libera' && { whiteSpace: 'pre-wrap' }) }}>{a.tipologia}</p>
                  {a.categoria_nome && (
                    <p style={{ color: '#9ca3af', fontSize: '9px', margin: 0 }}>{a.categoria_nome}</p>
                  )}
                  {a.finitura_nome && (
                    <p style={{ color: '#9ca3af', fontSize: '9px', margin: 0 }}>Finitura: {a.finitura_nome}</p>
                  )}
                  {(a.accessori_griglia?.length || a.accessori_selezionati?.length) ? (
                    <p style={{ color: '#6b7280', fontSize: '9px', margin: '2px 0 0' }}>
                      {[
                        ...(a.accessori_griglia ?? []).map((acc) => acc.nome),
                        ...(a.accessori_selezionati ?? []).map((acc) => acc.qty > 1 ? `${acc.nome} ×${acc.qty}` : acc.nome),
                      ].join(' · ')}
                    </p>
                  ) : null}
                  {a.misura_arrotondata && a.larghezza_listino_mm != null && (
                    <p style={{ color: '#d97706', fontSize: '9px', margin: 0 }}>
                      misura arrotondata a {a.larghezza_listino_mm}×{a.altezza_listino_mm}
                    </p>
                  )}
                  {a.note && (
                    <p style={{ color: '#9ca3af', fontSize: '9px', fontStyle: 'italic', margin: '2px 0 0' }}>{a.note}</p>
                  )}
                </div>
              </div>
            </div>

            {/* L mm */}
            <div style={{ textAlign: 'right', color: '#6b7280', paddingTop: '2px' }}>
              {a.tipo === 'libera' ? '—' : a.larghezza_mm}
            </div>

            {/* A mm */}
            <div style={{ textAlign: 'right', color: '#6b7280', paddingTop: '2px' }}>
              {a.tipo === 'libera' ? '—' : a.altezza_mm}
            </div>

            {/* P. Unit. */}
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
              € {formatEuro(a.prezzo_unitario)}
            </div>

            {/* Qtà */}
            <div style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
              {a.quantita}
            </div>

            {/* P. Totale */}
            <div style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
              € {formatEuro(a.prezzo_totale_riga)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Totali ── */}
      <div className="stampa-section px-8 print:px-0 py-4 border-t-2 border-gray-400">
        <div className="ml-auto max-w-xs space-y-1 text-[11px]">
          <div className="flex justify-between text-gray-600">
            <span>Subtotale ({p.totale_pezzi} pz)</span>
            <span className="tabular-nums">€ {formatEuro(p.subtotale)}</span>
          </div>
          {p.sconto_globale > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Sconto {p.sconto_globale}%</span>
              <span className="tabular-nums">− € {formatEuro(p.importo_sconto)}</span>
            </div>
          )}
          {p.riepilogo_iva.map((r) => (
            <div key={r.aliquota} className="flex justify-between text-gray-500">
              <span>IVA {r.aliquota}% (su € {formatEuro(r.imponibile)})</span>
              <span className="tabular-nums">€ {formatEuro(r.iva)}</span>
            </div>
          ))}
          {p.iva_totale > 0 && p.riepilogo_iva.length > 1 && (
            <div className="flex justify-between text-gray-600">
              <span>Totale IVA</span>
              <span className="tabular-nums">€ {formatEuro(p.iva_totale)}</span>
            </div>
          )}
          {p.modalita_trasporto === 'separato' && (
            <div className="flex justify-between text-gray-600">
              <span>Spese trasporto</span>
              <span className="tabular-nums">€ {formatEuro(p.spese_trasporto)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-[13px] border-t border-gray-400 pt-2 mt-2">
            <span>TOTALE FINALE</span>
            <span className="tabular-nums">€ {formatEuro(p.totale_finale)}</span>
          </div>
        </div>
      </div>

      {/* ── Note preventivo ── */}
      {p.note && (
        <div className="stampa-section px-8 print:px-0 py-3 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</p>
          <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{p.note}</p>
        </div>
      )}

      {/* ── Cataloghi allegati ── */}
      {p.cataloghi_allegati_data.map((c) => (
        <AllegatoCatalogoPdf key={c.id} url={c.url} nome={c.nome} />
      ))}

      {/* ── Piè di pagina fisso (stampa) ── */}
      <style>{`
        @page {
          margin: 15mm 18mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .stampa-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            border-top: 1px solid #d1d5db;
            background: white;
            padding: 4px 0;
            font-size: 9px;
            color: #6b7280;
            display: flex;
            justify-content: space-between;
          }
        }
        @media screen {
          .stampa-footer {
            display: none;
          }
        }
      `}</style>
      <div className="stampa-footer">
        <span>Data: {dataFormattata}</span>
        {p.numero && <span>{p.numero}</span>}
        {settings?.denominazione && <span>{settings.denominazione}</span>}
      </div>
    </div>
  )
}
