'use client'

import { Printer, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, AccontoCommessa, MetodoPagamento } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'

interface Props {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
}

const METODI: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  bonifico: 'Bonifico',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}

function formatData(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default function RicevutaAcconto({ commessa, acconto, settings, logoUrl }: Props) {
  const ricevutaRef = acconto.id.slice(-6).toUpperCase()

  return (
    <>
      {/* Toolbar — solo schermo */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/commesse">
            <ChevronLeft className="h-4 w-4" />
            Torna alle commesse
          </Link>
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa / Salva PDF
        </Button>
      </div>

      {/* Sfondo grigio schermo */}
      <div className="print:hidden bg-gray-100 min-h-screen py-10 px-4 flex items-start justify-center">
        <div className="bg-white shadow-md w-full max-w-[600px] p-10">
          <Ricevuta commessa={commessa} acconto={acconto} settings={settings} logoUrl={logoUrl} ricevutaRef={ricevutaRef} />
        </div>
      </div>

      {/* Stampa */}
      <div className="hidden print:block p-10 max-w-[600px] mx-auto">
        <Ricevuta commessa={commessa} acconto={acconto} settings={settings} logoUrl={logoUrl} ricevutaRef={ricevutaRef} />
      </div>

      <style>{`
        @page { size: A4; margin: 20mm 25mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
    </>
  )
}

function Ricevuta({ commessa, acconto, settings, logoUrl, ricevutaRef }: {
  commessa: CommessaCompleta
  acconto: AccontoCommessa
  settings: Settings | null
  logoUrl: string | null
  ricevutaRef: string
}) {
  // Snapshot alla data di emissione: solo acconti creati fino a questo incluso
  const accontinSnapshot = commessa.acconti
    .filter((a) => a.created_at <= acconto.created_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const totaleSnapshot = accontinSnapshot.reduce((sum, a) => sum + a.importo, 0)
  const saldoSnapshot = commessa.totale - totaleSnapshot

  return (
    <div className="font-sans text-gray-900 text-[13px] space-y-6">

      {/* Intestazione azienda */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />
          )}
          {settings?.denominazione && (
            <div>
              <p className="font-bold text-[15px]">{settings.denominazione}</p>
              <p className="text-gray-500 text-[11px]">
                {[settings.indirizzo, settings.piva ? `P.IVA ${settings.piva}` : null]
                  .filter(Boolean).join(' — ')}
              </p>
              <p className="text-gray-500 text-[11px]">
                {[settings.telefono, settings.email].filter(Boolean).join(' — ')}
              </p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Rif.</p>
          <p className="font-mono font-bold text-[15px] text-gray-700">{ricevutaRef}</p>
        </div>
      </div>

      <hr className="border-gray-300" />

      {/* Titolo */}
      <div className="text-center space-y-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ricevuta di pagamento</p>
        <p className="text-[13px] text-gray-500">Data: <strong>{formatData(acconto.data_pagamento)}</strong></p>
      </div>

      <hr className="border-gray-200" />

      {/* Cliente */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Cliente</p>
        <p className="text-[16px] font-semibold">{commessa.cliente_nome}</p>
      </div>

      {/* Importo — elemento centrale */}
      <div className="border-2 border-gray-200 rounded-lg p-6 text-center space-y-1 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Si dichiara di aver ricevuto la somma di
        </p>
        <p className="text-4xl font-bold text-gray-900">{formatEuro(acconto.importo)}</p>
        <p className="text-[12px] text-gray-500">
          Metodo di pagamento: <strong>{METODI[acconto.metodo_pagamento] ?? acconto.metodo_pagamento}</strong>
        </p>
      </div>

      {/* Riferimento e causale */}
      <div className="space-y-2">
        {(commessa.numero_commessa || commessa.numero_preventivo) && (
          <div className="flex gap-2 flex-wrap">
            {commessa.numero_commessa && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">N. Commessa</p>
                <p className="font-mono font-medium">{commessa.numero_commessa}</p>
              </div>
            )}
            {commessa.numero_preventivo && (
              <div className="ml-8">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">N. Preventivo</p>
                <p className="font-mono font-medium">{commessa.numero_preventivo}</p>
              </div>
            )}
          </div>
        )}
        {commessa.note && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Descrizione lavori</p>
            <p className="text-gray-700">{commessa.note}</p>
          </div>
        )}
        {acconto.note && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Note pagamento</p>
            <p className="text-gray-700">{acconto.note}</p>
          </div>
        )}
      </div>

      {/* Riepilogo acconti */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Riepilogo pagamenti
        </p>
        {accontinSnapshot.length > 1 && (
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1 text-gray-400 font-semibold">Data</th>
                <th className="text-left py-1 text-gray-400 font-semibold">Metodo</th>
                <th className="text-right py-1 text-gray-400 font-semibold">Importo</th>
              </tr>
            </thead>
            <tbody>
              {accontinSnapshot.map((a) => (
                <tr key={a.id} className={`border-b border-gray-100 ${a.id === acconto.id ? 'font-semibold bg-gray-50' : 'text-gray-500'}`}>
                  <td className="py-1">{formatData(a.data_pagamento)}</td>
                  <td className="py-1">{METODI[a.metodo_pagamento] ?? a.metodo_pagamento}</td>
                  <td className="py-1 text-right">{formatEuro(a.importo)}{a.id === acconto.id ? ' ←' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-between mt-2 text-[12px]">
          <span className="text-gray-500">Totale lavori</span>
          <span className="font-medium">{formatEuro(commessa.totale)}</span>
        </div>
        <div className="flex justify-between mt-0.5 text-[12px]">
          <span className="text-gray-500">Totale ricevuto</span>
          <span className="font-semibold">{formatEuro(totaleSnapshot)}</span>
        </div>
        <div className="flex justify-between mt-1 pt-1 text-[12px] border-t border-gray-200">
          <span className="text-gray-600 font-medium">Saldo rimanente</span>
          <span className={`font-bold ${saldoSnapshot <= 0.005 ? 'text-green-600' : 'text-orange-600'}`}>
            {formatEuro(saldoSnapshot)}
          </span>
        </div>
      </div>

      <hr className="border-gray-300 mt-8" />

      {/* Firma */}
      <div className="flex justify-between items-end pt-4">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-6">Firma del ricevente</p>
          <div className="w-48 border-b border-gray-400" />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-6">Data e luogo</p>
          <div className="w-36 border-b border-gray-400" />
        </div>
      </div>

    </div>
  )
}
