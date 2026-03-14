'use client'

import { useEffect } from 'react'
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

export default function StampaCalcoli({ preventivo: p, settings, logoUrl }: Props) {
  const s = p.cliente_snapshot
  const nomeCliente = s.tipo === 'azienda'
    ? s.ragione_sociale || s.email || s.telefono || '—'
    : [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || s.telefono || '—'
  const dataFormattata = new Date(p.created_at).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const titolo = p.numero ? `Calcolo costi — Offerta N. ${p.numero}` : 'Calcolo costi — Preventivo'

  const prefissoCalcoli = settings?.num_prefisso_calcoli?.trim() || 'Calcoli'

  useEffect(() => {
    const prev = document.title
    document.title = p.numero ? `${prefissoCalcoli} ${p.numero} ${nomeCliente}` : `${prefissoCalcoli} ${nomeCliente}`
    return () => { document.title = prev }
  }, [p.numero, nomeCliente, prefissoCalcoli])

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
          Stampa calcoli
        </Button>
      </div>

      {/* Sfondo grigio schermo */}
      <div className="print:hidden bg-gray-100 min-h-screen py-8 px-4">
        <DocumentoCalcoli
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
        <DocumentoCalcoli
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

// ─── Documento A4 ─────────────────────────────────────────────────────────────

interface DocProps {
  p: PreventivoCompleto
  s: PreventivoCompleto['cliente_snapshot']
  nomeCliente: string
  dataFormattata: string
  titolo: string
  settings: Settings | null
  logoUrl: string | null
}

function DocumentoCalcoli({ p, s, nomeCliente, dataFormattata, titolo, settings, logoUrl }: DocProps) {
  const articoliOrdinati = [...p.articoli].sort((a, b) => a.ordine - b.ordine)
  const totaleCostiAcquisto = articoliOrdinati.reduce((sum, a) => sum + a.costo_acquisto_unitario * a.quantita, 0)
  const totalePosa = articoliOrdinati.reduce((sum, a) => sum + a.costo_posa * a.quantita, 0)
  const costoTotale = totaleCostiAcquisto + totalePosa + p.spese_trasporto
  const utile = p.totale_articoli - costoTotale
  const percUtile = costoTotale > 0 ? (utile / costoTotale) * 100 : null

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

        {/* Cliente */}
        <div className="text-right min-w-[180px]">
          <p className="font-semibold text-sm">{nomeCliente}</p>
          {s.indirizzo && <p className="text-gray-600">{s.indirizzo}</p>}
          {s.cantiere && <p className="text-gray-500 text-[10px] mt-1">Cantiere: {s.cantiere}</p>}
        </div>
      </div>

      {/* ── Titolo ── */}
      <div className="px-8 print:px-0 py-3 border-b border-gray-300">
        <p className="text-center font-bold text-[13px] tracking-wide">{titolo}</p>
        <p className="text-center text-[9px] text-amber-700 mt-1 uppercase tracking-widest">
          Documento riservato — uso interno aziendale — non divulgare al cliente
        </p>
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

      {/* ── Tabella costi per articolo ── */}
      <div className="px-8 print:px-0 py-4">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b-2 border-gray-400 bg-gray-50 print:bg-gray-100">
              <th className="py-2 text-center w-7">#</th>
              <th className="py-2 text-left">Articolo</th>
              <th className="py-2 text-center w-9">Qtà</th>
              <th className="py-2 text-right w-24">Ricavo unit.</th>
              <th className="py-2 text-right w-24">C. Acq. unit.</th>
              <th className="py-2 text-right w-20">Posa unit.</th>
              <th className="py-2 text-right w-24">Costo totale</th>
              <th className="py-2 text-right w-24">Margine</th>
            </tr>
          </thead>
          <tbody>
            {articoliOrdinati.map((a, i) => {
              const costoTotRiga = (a.costo_acquisto_unitario + a.costo_posa) * a.quantita
              const margineRiga = a.prezzo_totale_riga - costoTotRiga
              return (
                <tr key={a.id} className="border-b border-gray-200 align-top">
                  <td className="py-2 text-center text-gray-500 font-mono">
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-semibold">{a.tipologia}</p>
                    {a.categoria_nome && (
                      <p className="text-gray-400 text-[9px]">{a.categoria_nome}</p>
                    )}
                    {a.tipo !== 'libera' && a.larghezza_mm && (
                      <p className="text-gray-400 text-[9px]">{a.larghezza_mm}×{a.altezza_mm} mm</p>
                    )}
                  </td>
                  <td className="py-2 text-center tabular-nums">{a.quantita}</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">
                    € {formatEuro(a.prezzo_unitario)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">
                    {a.costo_acquisto_unitario > 0 ? `€ ${formatEuro(a.costo_acquisto_unitario)}` : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700">
                    {a.costo_posa > 0 ? `€ ${formatEuro(a.costo_posa)}` : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium text-gray-800">
                    {costoTotRiga > 0 ? `€ ${formatEuro(costoTotRiga)}` : '—'}
                  </td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${margineRiga >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    € {formatEuro(margineRiga)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Riepilogo economico ── */}
      <div className="px-8 print:px-0 py-4">
        <div
          className="ml-auto max-w-sm rounded-lg space-y-1.5 text-[11px] p-4"
          style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700 mb-2">Riepilogo costi — uso interno</p>
          <div className="flex justify-between text-gray-600">
            <span>Ricavo netto (IVA esclusa)</span>
            <span className="tabular-nums">€ {formatEuro(p.totale_articoli)}</span>
          </div>
          <div className="border-t border-amber-200 pt-1.5 space-y-1">
            <div className="flex justify-between text-gray-700">
              <span>— Costi acquisto fornitore</span>
              <span className="tabular-nums">€ {formatEuro(totaleCostiAcquisto)}</span>
            </div>
            {totalePosa > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>— Costi posa</span>
                <span className="tabular-nums">€ {formatEuro(totalePosa)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-700">
              <span>— Spese trasporto</span>
              <span className="tabular-nums">€ {formatEuro(p.spese_trasporto)}</span>
            </div>
          </div>
          <div className={`flex justify-between font-bold text-[13px] border-t border-amber-300 pt-2 mt-1 ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            <span>
              UTILE LORDO
              {percUtile !== null && (
                <span className="ml-2 font-normal text-[11px] opacity-80">
                  ({percUtile.toFixed(1).replace('.', ',')}% sul costo)
                </span>
              )}
            </span>
            <span className="tabular-nums">€ {formatEuro(utile)}</span>
          </div>
          {p.iva_totale > 0 && (
            <div className="flex justify-between text-gray-500 text-[10px] pt-1">
              <span>IVA totale (non è ricavo)</span>
              <span className="tabular-nums">€ {formatEuro(p.iva_totale)}</span>
            </div>
          )}
        </div>
      </div>

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
          .calcoli-footer {
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
          .calcoli-footer {
            display: none;
          }
        }
      `}</style>
      <div className="calcoli-footer">
        <span>Data: {dataFormattata}</span>
        {p.numero && <span>{p.numero}</span>}
        <span>USO INTERNO — RISERVATO</span>
      </div>
    </div>
  )
}
