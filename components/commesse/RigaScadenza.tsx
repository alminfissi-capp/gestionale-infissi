'use client'

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import {
  Pencil, Trash2, Camera, Check, Loader2, Star, Landmark, GripVertical, Copy, CalendarPlus,
  MoreVertical, Printer, Paperclip, FileText, Ban, RotateCcw, CalendarOff, CalendarClock,
  CalendarCheck, CalendarX,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatEuro } from '@/lib/pricing'
import type { Scadenza, CategoriaScadenza } from '@/types/commessa'

const CAT_BADGE: Record<CategoriaScadenza, { label: string; cls: string } | null> = {
  finanziamento: { label: 'Finanz.', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  assegno: { label: 'Ass./Bon.', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  utenza: { label: 'Utenza', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  tassa: { label: 'Tassa', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  altro: null,
}

// Bordo sinistro colorato per distinguere a colpo d'occhio assegni e rate
const CAT_BORDER: Record<CategoriaScadenza, string> = {
  finanziamento: 'border-l-purple-400',
  assegno: 'border-l-blue-400',
  utenza: 'border-l-amber-400',
  tassa: 'border-l-rose-400',
  altro: 'border-l-transparent',
}

// Sfondo riga sbiadito per categoria (lo stato "pagato" ha la precedenza col verde)
const CAT_BG: Record<CategoriaScadenza, string> = {
  finanziamento: 'bg-purple-50/60',
  assegno: 'bg-blue-50/60',
  utenza: 'bg-amber-50/60',
  tassa: 'bg-rose-50/60',
  altro: 'bg-white',
}

const giornoDi = (data: string) => Number(data.slice(8, 10))

const formatGiorno = (data: string) => {
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

export type RigaScadenzaProps = {
  s: Scadenza
  contoNome: Record<string, string>
  fotoUrl?: string
  uploading: boolean
  setCameraRef: (el: HTMLInputElement | null) => void
  setFileRef: (el: HTMLInputElement | null) => void
  onClickCamera: () => void
  onClickFile: () => void
  onTogglePagato: (s: Scadenza) => void
  onToggleCalcoli: (s: Scadenza) => void
  onToggleAnnullata: (s: Scadenza) => void
  /** Vero se la scadenza ha gia' un evento specchio in agenda. */
  inCalendario?: boolean
  onToggleCalendario?: (s: Scadenza) => void
  onDelete: (s: Scadenza) => void
  onFotoSelected: (s: Scadenza, file: File | null) => void
  onOpenFoto: (url: string, s: Scadenza) => void
  onEdit: (s: Scadenza) => void
  onCopia: (s: Scadenza, cadenzaMesi: number) => void
  onApriPiano: (s: Scadenza) => void
  /** Assente nel blocco "da programmare": la riga e' gia' lì */
  onSpostaInLimbo?: (s: Scadenza) => void
  copying: boolean
  /** Riga appena raggiunta dalla ricerca: anello colorato finche' non si scorre altrove */
  evidenziata?: boolean
  /**
   * Riga del blocco "da programmare": niente colonna del giorno, niente copie
   * nei mesi successivi (non c'e' una data da cui contare) e la spunta verde
   * apre la scheda invece di funzionare da interruttore.
   */
  daProgrammare?: boolean
}

export default function RigaScadenza({
  s, contoNome, fotoUrl, uploading, setCameraRef, setFileRef, onClickCamera, onClickFile,
  onTogglePagato, onToggleCalcoli, onToggleAnnullata, inCalendario = false,
  onToggleCalendario, onDelete, onFotoSelected, onOpenFoto, onEdit,
  onCopia, onApriPiano, onSpostaInLimbo, copying, evidenziata = false,
  daProgrammare = false,
}: RigaScadenzaProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const badge = CAT_BADGE[s.categoria]
  const isPdf = !!s.foto_path?.toLowerCase().endsWith('.pdf')
  const rata = s.numero_rata != null
    ? `Rata ${s.numero_rata}${s.totale_rate ? `/${s.totale_rate}` : ''}`
    : null
  // F24, IVA e contributi tornano periodicamente come le rate e le utenze
  const ripetibile =
    !daProgrammare &&
    (s.categoria === 'finanziamento' || s.categoria === 'utenza' || s.categoria === 'tassa')

  return (
    <div
      ref={setNodeRef}
      id={`scadenza-${s.id}`}
      style={style}
      {...attributes}
      className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2.5 border-l-4 ${
        evidenziata ? 'ring-2 ring-inset ring-rose-400' : ''
      } ${
        s.annullata ? 'border-l-gray-300' : CAT_BORDER[s.categoria]
      } ${
        isDragging
          ? 'opacity-50 bg-rose-50 relative z-10'
          : s.annullata
            ? 'bg-gray-100 opacity-60'
            : s.pagato
              ? 'bg-emerald-50'
              : CAT_BG[s.categoria]
      }`}
    >
      {/* Maniglia trascinamento */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        type="button"
        title="Trascina per riordinare"
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Pagato toggle: nel limbo apre la scheda, perche' senza data la spunta
          non saprebbe in che mese collocare la riga */}
      <button
        type="button"
        onClick={() => onTogglePagato(s)}
        disabled={s.annullata}
        title={
          s.annullata
            ? 'Scadenza annullata'
            : daProgrammare
              ? 'Segna come pagata: chiede la data e la colloca nel mese giusto'
              : s.pagato ? 'Segna come da pagare' : 'Segna come pagata'
        }
        className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
          s.annullata
            ? 'border-gray-300 text-gray-300 cursor-not-allowed'
            : s.pagato
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 text-transparent hover:border-emerald-400'
        }`}
      >
        {s.annullata ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </button>

      {/* Giorno del mese (solo nei blocchi anno) */}
      {!daProgrammare && (
        <div className="w-8 shrink-0 text-center">
          <span className="text-sm font-semibold text-gray-700">
            {s.data_scadenza ? giornoDi(s.data_scadenza) : '—'}
          </span>
        </div>
      )}

      {/* Fornitore + descrizione */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-medium truncate max-w-full ${
            s.annullata ? 'text-gray-500 line-through' : 'text-gray-800'
          }`}>
            {s.fornitore || <span className="text-gray-400">—</span>}
          </p>
          {s.annullata && (
            <span className="text-[10px] rounded border border-gray-300 bg-gray-200 text-gray-600 px-1 py-0 font-semibold uppercase tracking-wide">
              Annullata
            </span>
          )}
          {badge && (
            <span className={`text-[10px] rounded border px-1 py-0 font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {/* Nel limbo una data c'e' solo se e' un promemoria: la riga resta qui
              finche' non viene anche spuntata come pagata */}
          {daProgrammare && s.data_scadenza && (
            <span className="inline-flex items-center gap-0.5 text-[10px] rounded border border-gray-200 bg-gray-50 text-gray-500 px-1 py-0">
              <CalendarClock className="h-2.5 w-2.5" />
              prevista il {formatGiorno(s.data_scadenza)}
            </span>
          )}
          {rata && (
            <span className="text-[10px] rounded border border-gray-200 bg-gray-50 text-gray-500 px-1 py-0">
              {rata}
            </span>
          )}
          {s.conto_id && contoNome[s.conto_id] && (
            <span className="sm:hidden inline-flex items-center gap-0.5 text-[10px] rounded border border-slate-200 bg-slate-50 text-slate-600 px-1 py-0">
              <Landmark className="h-2.5 w-2.5" />
              {contoNome[s.conto_id]}
            </span>
          )}
        </div>
        {s.descrizione && (
          <p className="text-xs text-gray-500 truncate">{s.descrizione}</p>
        )}
      </div>

      {/* Conto corrente (colonna allineata a sinistra, va a capo se lunga, da tablet in su) */}
      <div className="hidden sm:flex w-28 shrink-0 items-start gap-1 text-xs">
        {s.conto_id && contoNome[s.conto_id] ? (
          <>
            <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="text-slate-700 font-medium leading-tight break-words">{contoNome[s.conto_id]}</span>
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Allegato: foto dell'assegno oppure PDF della contabile del bonifico */}
      <input
        ref={setCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFotoSelected(s, e.target.files?.[0] ?? null)}
      />
      <input
        ref={setFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFotoSelected(s, e.target.files?.[0] ?? null)}
      />
      <div className="w-20 shrink-0 flex items-center justify-center">
        {uploading ? (
          <div className="h-12 w-20 rounded border bg-gray-50 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : s.foto_path ? (
          isPdf ? (
            // Il PDF si riconosce a colpo d'occhio; il clic apre comunque l'anteprima
            <button
              type="button"
              onClick={() => fotoUrl && onOpenFoto(fotoUrl, s)}
              disabled={!fotoUrl}
              className="h-12 w-20 rounded border bg-red-50 border-red-200 flex flex-col items-center justify-center gap-0.5 hover:ring-2 hover:ring-rose-300 disabled:opacity-50"
              title="Apri anteprima del bonifico"
            >
              <FileText className="h-5 w-5 text-red-500" />
              <span className="text-[9px] font-semibold text-red-600">PDF</span>
            </button>
          ) : fotoUrl ? (
            <button
              type="button"
              onClick={() => onOpenFoto(fotoUrl, s)}
              className="h-12 w-20 rounded border overflow-hidden bg-gray-50 hover:ring-2 hover:ring-rose-300"
              title="Apri foto"
            >
              <img src={fotoUrl} alt="foto scadenza" className="h-full w-full object-contain" />
            </button>
          ) : (
            <div className="h-12 w-20 rounded border bg-gray-100 animate-pulse" />
          )
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-gray-400 hover:text-rose-600"
                title={
                  s.categoria === 'assegno'
                    ? 'Allega assegno o contabile del bonifico'
                    : 'Allega foto o documento'
                }
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClickCamera}>
                <Camera className="h-4 w-4 mr-2" />
                Scatta foto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClickFile}>
                <FileText className="h-4 w-4 mr-2" />
                Scegli file (foto o PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Importo */}
      <div className="w-24 shrink-0 text-right">
        <span className={`text-sm font-semibold ${
          s.annullata
            ? 'text-gray-400 line-through'
            : s.pagato ? 'text-emerald-700 line-through' : 'text-gray-900'
        }`}>
          {formatEuro(s.importo)}
        </span>
      </div>

      {/* Stella Calcoli */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={s.annullata}
        title={
          s.annullata
            ? 'Le scadenze annullate non entrano nei Calcoli'
            : s.in_calcoli ? 'Rimuovi dai Calcoli' : 'Aggiungi ai Calcoli'
        }
        onClick={() => onToggleCalcoli(s)}
      >
        <Star className={`h-4 w-4 ${s.in_calcoli ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-400'}`} />
      </Button>

      {/* Menu azioni (modifica, stampa, copia, elimina) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700"
            title="Azioni"
            disabled={copying}
          >
            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(s)}>
            <Pencil className="h-4 w-4 mr-2" />
            {daProgrammare ? 'Modifica / programma' : 'Modifica'}
          </DropdownMenuItem>
          {/* Link vero e non window.open: nella PWA installata (display standalone)
              le finestre popup vengono bloccate in silenzio */}
          <DropdownMenuItem asChild>
            <Link href={`/scadenze/${s.id}/stampa`}>
              <Printer className="h-4 w-4 mr-2" />
              Stampa scheda
            </Link>
          </DropdownMenuItem>

          {/* Copia nei mesi successivi (rate dei finanziamenti e bollette ricorrenti) */}
          {ripetibile && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCopia(s, 1)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Copia al mese successivo
              </DropdownMenuItem>
              {s.categoria === 'utenza' && (
                <DropdownMenuItem onClick={() => onCopia(s, 2)}>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Copia +2 mesi (bimestrale)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onCopia(s, 3)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Copia +3 mesi (trimestrale)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onApriPiano(s)}>
                <Copy className="h-4 w-4 mr-2" />
                {s.categoria === 'utenza' ? 'Ripeti su più mesi…' : 'Genera piano rate…'}
              </DropdownMenuItem>
            </>
          )}

          {/* Rimanda nel limbo: la riga perde la data e torna in attesa */}
          {onSpostaInLimbo && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSpostaInLimbo(s)}>
                <CalendarOff className="h-4 w-4 mr-2" />
                Sposta in Da programmare
              </DropdownMenuItem>
            </>
          )}

          {/* In agenda: l'evento e' uno specchio in sola lettura del calendario */}
          {onToggleCalendario && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleCalendario(s)}>
                {inCalendario ? (
                  <>
                    <CalendarX className="h-4 w-4 mr-2" />
                    Togli dal calendario
                  </>
                ) : (
                  <>
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    Mostra in calendario
                  </>
                )}
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          {/* Annulla: la scadenza resta con foto e dati, ma esce dai totali */}
          <DropdownMenuItem
            onClick={() => onToggleAnnullata(s)}
            className={s.annullata ? '' : 'text-amber-700 focus:text-amber-700'}
          >
            {s.annullata ? (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Ripristina scadenza
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Annulla scadenza
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            // confirm() bloccante: lo lanciamo dopo la chiusura del menu
            onSelect={() => setTimeout(() => onDelete(s), 0)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
