'use client'

import Link from 'next/link'
import { Printer, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import AllegatoCatalogoPdf from '@/components/preventivi/AllegatoCatalogoPdf'
import type { CommessaCompleta, MetodoPagamento, StatoCommessa } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'

interface Props {
  commessa: CommessaCompleta
  settings: Settings | null
  logoUrl: string | null
  selectedDocIds: string[]
  docUrls: Record<string, string>
}

const STATI: Record<StatoCommessa, string> = {
  in_attesa: 'In attesa',
  da_iniziare: 'Da iniziare',
  in_lavorazione: 'In lavorazione',
  da_consegnare: 'Da consegnare',
  consegnato: 'Consegnato',
  parzialmente_consegnato: 'Parz. consegnato',
  concluso: 'Concluso',
  bloccato: 'Bloccato',
  annullato: 'Annullato',
}

const METODI: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  bonifico: 'Bonifico',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}

function formatData(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT')
}

function formatMese(data: string) {
  const [y, m] = data.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const mese = d.toLocaleDateString('it-IT', { month: 'long' })
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{children}</p>
)

export default function StampaCommessa({ commessa: c, settings, logoUrl, selectedDocIds, docUrls }: Props) {
  const saldoZero = c.saldo >= -0.005 && c.saldo <= 0.005
  const saldoPositivo = c.saldo > 0.005

  const selectedDocs = selectedDocIds
    .map((id) => ({ doc: c.documenti.find((d) => d.id === id), url: docUrls[id] }))
    .filter((x): x is { doc: NonNullable<typeof x.doc>; url: string } => !!x.doc && !!x.url)

  return (
    <>
      {/* Toolbar — solo schermo */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/commesse`}>
            <ChevronLeft className="h-4 w-4" />
            Torna alle commesse
          </Link>
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa / Salva PDF
        </Button>
        <p className="text-xs text-gray-400 hidden lg:inline">
          Per rimuovere l&apos;URL in fondo, disabilita <em>Intestazioni e piè di pagina</em> nella finestra di stampa
        </p>
      </div>

      {/* Sfondo grigio schermo */}
      <div className="print:hidden bg-gray-100 min-h-screen py-8 px-4">
        <div className="max-w-[680px] mx-auto bg-white shadow-md rounded p-8">
          <Contenuto c={c} settings={settings} logoUrl={logoUrl} saldoZero={saldoZero} saldoPositivo={saldoPositivo} />
        </div>
      </div>

      {/* Stampa */}
      <div className="hidden print:block">
        <Contenuto c={c} settings={settings} logoUrl={logoUrl} saldoZero={saldoZero} saldoPositivo={saldoPositivo} />
      </div>

      {/* Allegati */}
      {selectedDocs.map(({ doc, url }) => {
        const ext = doc.nome_file.split('.').pop()?.toLowerCase() ?? ''
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        return (
          <div key={doc.id} style={{ pageBreakBefore: 'always' }}>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={doc.nome_file} style={{ width: '100%', height: 'auto', display: 'block' }} />
            ) : (
              <AllegatoCatalogoPdf url={url} nome={doc.nome_file} />
            )}
          </div>
        )
      })}

      <style>{`
        @page { margin: 15mm 18mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  )
}

function Contenuto({ c, settings, logoUrl, saldoZero, saldoPositivo }: {
  c: CommessaCompleta
  settings: Settings | null
  logoUrl: string | null
  saldoZero: boolean
  saldoPositivo: boolean
}) {
  return (
    <div className="font-sans text-[14px] text-gray-900">
      {/* Intestazione azienda */}
      {settings?.denominazione && (
        <>
          <div className="flex items-center gap-3 mb-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
            )}
            <div className="flex flex-col text-[12px] text-gray-500">
              <strong className="text-[14px] text-gray-900">{settings.denominazione}</strong>
              <span>
                {[settings.indirizzo, settings.piva ? `P.IVA ${settings.piva}` : null, settings.telefono, settings.email]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </div>
          <hr className="border-gray-200 mb-5" />
        </>
      )}

      {/* Cliente e info */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{c.cliente_nome}</h1>
      <p className="text-[12px] text-gray-500 mb-5">
        {[
          c.numero_commessa && `N. ${c.numero_commessa}`,
          STATI[c.stato] ?? c.stato,
          formatMese(c.data_conferma),
          c.operatore_nome,
        ].filter(Boolean).join(' · ')}
      </p>

      {/* Descrizione */}
      {c.note && (
        <div className="mb-4">
          <SectionTitle>Descrizione lavori</SectionTitle>
          <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{c.note}</p>
        </div>
      )}

      {/* Preventivo */}
      {c.numero_preventivo && (
        <div className="mb-4">
          <SectionTitle>Preventivo</SectionTitle>
          <p className="font-mono text-[13px]">{c.numero_preventivo}</p>
        </div>
      )}

      {/* Documenti allegati (elenco riferimenti) */}
      {c.documenti.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Documenti allegati</SectionTitle>
          <ul className="list-disc list-inside text-[12px] text-gray-600 space-y-0.5">
            {c.documenti.map((d) => <li key={d.id}>{d.nome_file}</li>)}
          </ul>
        </div>
      )}

      {/* Importi */}
      <div className="mb-4">
        <SectionTitle>Importi</SectionTitle>
        <div className="flex gap-8 flex-wrap">
          <div>
            <p className="text-2xl font-bold">{formatEuro(c.totale)}</p>
            <p className="text-[10px] text-gray-400">Totale</p>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-600">{formatEuro(c.imponibile)}</p>
            <p className="text-[10px] text-gray-400">Imponibile</p>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-600">{formatEuro(c.iva_totale)}</p>
            <p className="text-[10px] text-gray-400">IVA</p>
          </div>
        </div>
      </div>

      {/* Acconti */}
      {c.acconti.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Pagamenti ricevuti</SectionTitle>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1 pr-4 text-gray-400 font-semibold">Data</th>
                <th className="text-left py-1 pr-4 text-gray-400 font-semibold">Metodo</th>
                <th className="text-right py-1 pr-4 text-gray-400 font-semibold">Importo</th>
                <th className="text-left py-1 text-gray-400 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {c.acconti.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-1 pr-4">{formatData(a.data_pagamento)}</td>
                  <td className="py-1 pr-4">{METODI[a.metodo_pagamento] ?? a.metodo_pagamento}</td>
                  <td className="py-1 pr-4 text-right font-semibold">{formatEuro(a.importo)}</td>
                  <td className="py-1 text-gray-400">{a.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right text-[12px] text-gray-500 mt-1">
            Totale acconti: <strong className="text-gray-800">{formatEuro(c.totale_acconti)}</strong>
          </p>
        </div>
      )}

      {/* Saldo */}
      <div className="border-t-2 border-gray-200 pt-4 mt-4 flex items-center justify-between">
        <div>
          <SectionTitle>Saldo rimanente</SectionTitle>
          <p className={`text-2xl font-bold ${saldoZero ? 'text-green-600' : saldoPositivo ? 'text-orange-600' : 'text-blue-600'}`}>
            {formatEuro(c.saldo)}
          </p>
        </div>
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${saldoZero ? 'bg-green-100 text-green-700' : saldoPositivo ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
          {saldoZero ? 'Pagato ✓' : saldoPositivo ? 'Da pagare' : 'Sovrapagato'}
        </span>
      </div>
    </div>
  )
}
