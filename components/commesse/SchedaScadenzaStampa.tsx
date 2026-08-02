'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { Printer, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import type { Scadenza, CategoriaScadenza } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'

const CATEGORIE: Record<CategoriaScadenza, string> = {
  finanziamento: 'Finanziamento',
  assegno: 'Assegno',
  utenza: 'Utenza',
  altro: 'Altro',
}

function formatData(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

interface Props {
  scadenza: Scadenza
  contoNome: string | null
  gruppoNome: string | null
  fotoUrl: string | null
  settings: Settings | null
  logoUrl: string | null
}

export default function SchedaScadenzaStampa({
  scadenza, contoNome, gruppoNome, fotoUrl, settings, logoUrl,
}: Props) {
  // Apre la finestra di stampa da sola, ma solo dopo che la foto è pronta
  // (altrimenti l'anteprima esce con il riquadro vuoto)
  const [fotoPronta, setFotoPronta] = useState(!fotoUrl)
  const stampato = useRef(false)

  useEffect(() => {
    if (!fotoPronta || stampato.current) return
    stampato.current = true
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [fotoPronta])

  const scheda = (
    <Scheda
      scadenza={scadenza}
      contoNome={contoNome}
      gruppoNome={gruppoNome}
      fotoUrl={fotoUrl}
      settings={settings}
      logoUrl={logoUrl}
      onFotoLoad={() => setFotoPronta(true)}
    />
  )

  return (
    <>
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/commesse">
            <ChevronLeft className="h-4 w-4" />
            Commesse
          </Link>
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa
        </Button>
      </div>

      {/* Sfondo grigio schermo */}
      <div className="print:hidden bg-gray-100 min-h-screen py-10 px-4 flex items-start justify-center">
        <div className="bg-white shadow-md w-full max-w-[600px] p-10">{scheda}</div>
      </div>

      {/* Stampa */}
      <div className="hidden print:block p-10 max-w-[600px] mx-auto">{scheda}</div>

      <style>{`
        @page { size: A4; margin: 15mm 20mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
    </>
  )
}

function Scheda({
  scadenza: s, contoNome, gruppoNome, fotoUrl, settings, logoUrl, onFotoLoad,
}: Props & { onFotoLoad: () => void }) {
  const rata = s.numero_rata != null
    ? `${s.numero_rata}${s.totale_rate ? ` di ${s.totale_rate}` : ''}`
    : null

  return (
    <div className="font-sans text-gray-900 text-[13px] space-y-6">

      {/* Intestazione azienda */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />}
          {settings?.denominazione && (
            <div>
              <p className="font-bold text-[15px]">{settings.denominazione}</p>
              <p className="text-gray-500 text-[11px]">
                {[settings.indirizzo, settings.piva ? `P.IVA ${settings.piva}` : null]
                  .filter(Boolean).join(' — ')}
              </p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Categoria</p>
          <p className="font-bold text-[15px] text-gray-700">{CATEGORIE[s.categoria]}</p>
        </div>
      </div>

      <hr className="border-gray-300" />

      {/* Titolo */}
      <div className="text-center space-y-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
          Scheda scadenza{gruppoNome ? ` — ${gruppoNome}` : ''}
        </p>
        <p className="text-[15px] font-semibold capitalize">{formatData(s.data_scadenza)}</p>
      </div>

      <hr className="border-gray-200" />

      {/* Fornitore */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Fornitore</p>
        <p className="text-[16px] font-semibold">{s.fornitore || '—'}</p>
        {s.descrizione && <p className="text-gray-600 whitespace-pre-line">{s.descrizione}</p>}
      </div>

      {/* Importo */}
      <div className="border-2 border-gray-200 rounded-lg p-6 text-center space-y-1 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Importo</p>
        <p className="text-4xl font-bold text-gray-900">{formatEuro(s.importo)}</p>
        <p className={`text-[12px] font-semibold ${s.pagato ? 'text-green-600' : 'text-orange-600'}`}>
          {s.pagato ? 'PAGATA' : 'DA PAGARE'}
        </p>
      </div>

      {/* Dettagli */}
      <div className="grid grid-cols-2 gap-y-3 gap-x-8">
        {rata && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Rata</p>
            <p className="font-medium">{rata}</p>
          </div>
        )}
        {contoNome && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Conto corrente</p>
            <p className="font-medium">{contoNome}</p>
          </div>
        )}
      </div>

      {/* Foto allegata */}
      {fotoUrl && (
        <div className="break-inside-avoid">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Documento allegato
          </p>
          <img
            src={fotoUrl}
            alt="Allegato scadenza"
            onLoad={onFotoLoad}
            onError={onFotoLoad}
            className="w-full max-h-[130mm] object-contain rounded border border-gray-200 bg-white"
          />
        </div>
      )}

    </div>
  )
}
