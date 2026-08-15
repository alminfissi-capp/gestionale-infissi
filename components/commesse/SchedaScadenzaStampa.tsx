'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, ChevronLeft } from 'lucide-react'
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

// Oltre questo tempo stampiamo comunque: meglio una scheda senza foto
// che una finestra di stampa che non si apre mai
const ATTESA_MAX_FOTO_MS = 5000

function formatData(d: string | null) {
  // Le scadenze del blocco "Da programmare" non hanno ancora una data
  if (!d) return 'Da programmare'
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

export default function SchedaScadenzaStampa(props: Props) {
  const router = useRouter()
  const { fotoUrl } = props
  const imgRef = useRef<HTMLImageElement>(null)
  const [fotoPronta, setFotoPronta] = useState(!fotoUrl)
  const giaStampato = useRef(false)

  // Rete lenta o immagine rotta: non restiamo bloccati in attesa
  useEffect(() => {
    if (fotoPronta) return
    const t = setTimeout(() => setFotoPronta(true), ATTESA_MAX_FOTO_MS)
    return () => clearTimeout(t)
  }, [fotoPronta])

  // `complete` copre il caso in cui la foto era già in cache al momento
  // dell'hydration: lì React non rilancia più onLoad.
  // La guardia va dentro la callback e non prima: in StrictMode (dev) il
  // cleanup annulla il primo frame e il secondo passaggio deve poter stampare.
  useEffect(() => {
    if (!fotoPronta && !imgRef.current?.complete) return
    const raf = requestAnimationFrame(() => {
      if (giaStampato.current) return
      giaStampato.current = true
      window.print()
    })
    return () => cancelAnimationFrame(raf)
  }, [fotoPronta])

  return (
    <>
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
          Indietro
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Stampa
        </Button>
      </div>

      {/* Una sola copia della scheda: in stampa cambia solo il contorno */}
      <div className="bg-gray-100 min-h-screen py-10 px-4 flex items-start justify-center print:bg-white print:block print:min-h-0 print:p-0">
        <div className="bg-white shadow-md w-full max-w-[600px] p-10 print:shadow-none print:max-w-none print:p-0">
          <Scheda {...props} imgRef={imgRef} onFotoLoad={() => setFotoPronta(true)} />
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 15mm 20mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
    </>
  )
}

function Scheda({
  scadenza: s, contoNome, gruppoNome, fotoUrl, settings, logoUrl, imgRef, onFotoLoad,
}: Props & {
  imgRef: React.RefObject<HTMLImageElement | null>
  onFotoLoad: () => void
}) {
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

      {/* Importo — una scadenza annullata non e' ne' pagata ne' da pagare */}
      <div className="border-2 border-gray-200 rounded-lg p-6 text-center space-y-1 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Importo</p>
        <p className={`text-4xl font-bold ${s.annullata ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {formatEuro(s.importo)}
        </p>
        <p className={`text-[12px] font-semibold ${
          s.annullata ? 'text-gray-500' : s.pagato ? 'text-green-600' : 'text-orange-600'
        }`}>
          {s.annullata ? 'ANNULLATA' : s.pagato ? 'PAGATA' : 'DA PAGARE'}
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
            ref={imgRef}
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
