'use client'

import Link from 'next/link'
import { Printer, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

interface Props {
  preventivo: PreventivoCompleto
  settings: Settings | null
  logoUrl: string | null
}

export default function StampaPreventivo({ preventivo: p, settings, logoUrl }: Props) {
  const s = p.cliente_snapshot
  const nomeCliente = [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || s.telefono || '—'
  const dataFormattata = new Date(p.created_at).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const titolo = p.numero ? `Offerta N. ${p.numero}` : 'Preventivo'

  return (
    <>
      {/* Toolbar — solo schermo */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/preventivi/${p.id}`}>
            <ChevronLeft className="h-4 w-4" />
            Torna al preventivo
          </Link>
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa
        </Button>
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
        print:max-w-none print:mx-0 print:shadow-none
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
          {s.indirizzo && <p className="text-gray-600">{s.indirizzo}</p>}
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

      {/* ── Tabella articoli ── */}
      <div className="px-8 print:px-0">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b-2 border-gray-400 bg-gray-50 print:bg-gray-100">
              <th className="py-2 text-center w-7">#</th>
              <th className="py-2 text-left">Descrizione</th>
              <th className="py-2 text-right w-14">L (mm)</th>
              <th className="py-2 text-right w-14">A (mm)</th>
              <th className="py-2 text-right w-20">P. Unit.</th>
              <th className="py-2 text-center w-9">Qtà</th>
              <th className="py-2 text-right w-22">P. Totale</th>
            </tr>
          </thead>
          <tbody>
            {articoliOrdinati.map((a, i) => (
              <tr key={a.id} className="border-b border-gray-200 align-top">
                <td className="py-2 text-center text-gray-500 font-mono">
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-start gap-2">
                    {a.immagine_url && (
                      <div style={{ width: '60px', height: '60px', flexShrink: 0, overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: '2px', background: '#f9fafb' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.immagine_url}
                          alt={a.tipologia}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-[11px]">{a.tipologia}</p>
                      {a.categoria_nome && (
                        <p className="text-gray-400 text-[9px]">{a.categoria_nome}</p>
                      )}
                      {a.finitura_nome && (
                        <p className="text-gray-400 text-[9px]">Finitura: {a.finitura_nome}</p>
                      )}
                      {a.misura_arrotondata && a.larghezza_listino_mm != null && (
                        <p className="text-amber-600 text-[9px]">
                          misura arrotondata a {a.larghezza_listino_mm}×{a.altezza_listino_mm}
                        </p>
                      )}
                      {a.note && (
                        <p className="text-gray-400 text-[9px] italic mt-0.5">{a.note}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500">
                  {a.tipo === 'libera' ? '—' : a.larghezza_mm}
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500">
                  {a.tipo === 'libera' ? '—' : a.altezza_mm}
                </td>
                <td className="py-2 text-right tabular-nums">
                  € {formatEuro(a.prezzo_unitario)}
                  {a.sconto_articolo > 0 && (
                    <span className="block text-red-500 text-[9px]">-{a.sconto_articolo}%</span>
                  )}
                </td>
                <td className="py-2 text-center tabular-nums">{a.quantita}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  € {formatEuro(a.prezzo_totale_riga)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Totali ── */}
      <div className="px-8 print:px-0 py-4 border-t-2 border-gray-400">
        <div className="ml-auto max-w-xs space-y-1 text-[11px]">
          {p.sconto_globale > 0 && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>Subtotale ({p.totale_pezzi} pz)</span>
                <span className="tabular-nums">€ {formatEuro(p.subtotale)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Sconto {p.sconto_globale}%</span>
                <span className="tabular-nums">− € {formatEuro(p.importo_sconto)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Totale articoli{p.sconto_globale === 0 ? ` (${p.totale_pezzi} pz)` : ''}</span>
            <span className="tabular-nums">€ {formatEuro(p.totale_articoli)}</span>
          </div>
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
          <div className="flex justify-between text-gray-600">
            <span>Spese trasporto</span>
            <span className="tabular-nums">€ {formatEuro(p.spese_trasporto)}</span>
          </div>
          <div className="flex justify-between font-bold text-[13px] border-t border-gray-400 pt-2 mt-2">
            <span>TOTALE FINALE</span>
            <span className="tabular-nums">€ {formatEuro(p.totale_finale)}</span>
          </div>
        </div>
      </div>

      {/* ── Note preventivo ── */}
      {p.note && (
        <div className="px-8 print:px-0 py-3 border-t border-gray-200">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</p>
          <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{p.note}</p>
        </div>
      )}

      {/* ── Piè di pagina fisso (stampa) ── */}
      <style>{`
        @page {
          margin: 15mm;
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
