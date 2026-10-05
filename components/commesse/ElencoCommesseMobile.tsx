'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown, ChevronRight, Copy, Euro, LayoutList, MoreVertical, MoveRight, Paperclip, Star, Trash2,
  TriangleAlert, Ban, WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatEuro } from '@/lib/pricing'
import { rigaClass, formatMese } from '@/lib/commesse-vista'
import { statoAllineamento } from '@/lib/allineamento-commessa'
import BadgeStatoCommessa from './BadgeStatoCommessa'
import type { CommessaCompleta, GruppoCommesse, PreventivoPerCommessa, StatoCommessa } from '@/types/commessa'
import type { VistaCommesseMobile } from '@/types/preferenze'

/*
 * Elenco commesse sul telefono, nelle tre forme che l'utente sceglie in
 * Impostazioni → Commesse e scadenze. Le stesse azioni della tabella di tablet
 * e PC; lo stesso componente disegna le anteprime nelle Impostazioni, cosi'
 * quello che si sceglie e' esattamente quello che si vedra'.
 */

export type AzioniCommessaMobile = {
  onScheda: () => void
  onAcconto: () => void
  onDocumenti: () => void
  onToggleCalcoli: () => void
  onToggleInesigibile: () => void
  onStatoChange: (s: StatoCommessa) => void
  onDuplica: () => void
  onDelete: () => void
  onSposta: (gruppoId: string) => void
}

type Props = {
  vista: VistaCommesseMobile
  commesse: CommessaCompleta[]
  /** Commesse create offline, non ancora sincronizzate: solo lettura. */
  inAttesa?: CommessaCompleta[]
  azioni: (c: CommessaCompleta) => AzioniCommessaMobile
  preventiviById: Map<string, PreventivoPerCommessa>
  altriGruppi: GruppoCommesse[]
  puoAprireProduzione: boolean
  puoModificareStato: boolean
  /** Anteprima in Impostazioni: niente click, e nella vista espandibile una riga gia' aperta. */
  anteprima?: boolean
}

const coloreSaldo = (saldo: number) =>
  saldo > 0.005 ? 'text-orange-600' : saldo < -0.005 ? 'text-blue-600' : 'text-green-600'

export default function ElencoCommesseMobile(props: Props) {
  const { vista, commesse, inAttesa = [], anteprima } = props
  return (
    <div className={anteprima ? 'pointer-events-none select-none' : undefined} inert={anteprima || undefined}>
      {vista === 'schede' && (
        <div className="space-y-2">
          {commesse.map((c) => <Scheda key={c.id} c={c} {...props} />)}
          {inAttesa.map((c) => <InAttesa key={c.id} c={c} />)}
        </div>
      )}
      {vista === 'righe' && (
        <div className="divide-y overflow-hidden rounded-lg border bg-white">
          {commesse.map((c) => <RigaCompatta key={c.id} c={c} {...props} />)}
          {inAttesa.map((c) => <InAttesa key={c.id} c={c} riga />)}
        </div>
      )}
      {vista === 'espandibili' && <Espandibili {...props} />}
    </div>
  )
}

type PropsVoce = Props & { c: CommessaCompleta }

/** Numero commessa: porta a Produzione se si ha accesso, come nella tabella. */
function NumeroCommessa({ c, puoAprireProduzione }: { c: CommessaCompleta; puoAprireProduzione: boolean }) {
  if (!c.numero_commessa) return null
  return puoAprireProduzione ? (
    <Link href={`/produzione/${c.id}?da=commesse`} className="font-mono text-teal-700 underline-offset-2 hover:underline">
      {c.numero_commessa}
    </Link>
  ) : (
    <span className="font-mono">{c.numero_commessa}</span>
  )
}

function Meta({ c, puoAprireProduzione }: { c: CommessaCompleta; puoAprireProduzione: boolean }) {
  const prev = c.preventivi_collegati[0]?.numero_preventivo
  const parti = [formatMese(c.data_conferma), c.operatore_nome || null, prev || null].filter(Boolean)
  return (
    <p className="truncate text-[11px] text-gray-500">
      <NumeroCommessa c={c} puoAprireProduzione={puoAprireProduzione} />
      {c.numero_commessa && parti.length > 0 ? ' · ' : ''}
      {parti.join(' · ')}
    </p>
  )
}

function Importi({ c, preventiviById, onScheda, terzo = 'saldo' }: {
  c: CommessaCompleta
  preventiviById: Map<string, PreventivoPerCommessa>
  onScheda: () => void
  terzo?: 'saldo' | 'iva'
}) {
  const disallineata = statoAllineamento(c, preventiviById).tipo === 'disallineata'
  return (
    <div className="grid grid-cols-3 gap-2 tabular-nums">
      <div>
        <p className="text-[10px] text-gray-500">Totale</p>
        <p className="flex items-center gap-1 text-[13px] font-semibold">
          {disallineata && (
            <button type="button" onClick={onScheda} className="text-amber-500" aria-label="Totale non allineato ai preventivi: apri la scheda">
              <TriangleAlert className="h-3 w-3" />
            </button>
          )}
          {formatEuro(c.totale)}
        </p>
      </div>
      <div>
        <p className="text-[10px] text-gray-500">Acconti</p>
        <p className="text-[13px]">{c.totale_acconti > 0 ? formatEuro(c.totale_acconti) : '—'}</p>
      </div>
      {terzo === 'saldo' ? (
        <div>
          <p className="text-[10px] text-gray-500">Saldo</p>
          <p className={`text-[13px] font-bold ${coloreSaldo(c.saldo)}`}>{formatEuro(c.saldo)}</p>
        </div>
      ) : (
        <div>
          <p className="text-[10px] text-gray-500">IVA</p>
          <p className="text-[13px]">{formatEuro(c.iva_totale)}</p>
        </div>
      )}
    </div>
  )
}

function TastiRapidi({ c, a }: { c: CommessaCompleta; a: AzioniCommessaMobile }) {
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={a.onAcconto}>
        <Euro className="h-3 w-3" /> Acconti
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={a.onDocumenti} aria-label="Documenti allegati">
        <Paperclip className="h-3 w-3" /> {c.documenti.length}
      </Button>
      <Button
        type="button" variant="outline" size="sm" className="h-7 px-2"
        onClick={a.onToggleCalcoli}
        aria-label={c.in_calcoli ? 'Togli dai Calcoli' : 'Aggiungi ai Calcoli'}
      >
        <Star className={`h-3.5 w-3.5 ${c.in_calcoli ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
      </Button>
    </>
  )
}

/** Menu ⋮. Con `completo` contiene anche le azioni che nelle schede hanno un tasto proprio. */
function MenuCommessa({ c, a, altriGruppi, completo }: {
  c: CommessaCompleta; a: AzioniCommessaMobile; altriGruppi: GruppoCommesse[]; completo?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Altre azioni">
          <MoreVertical className="h-4 w-4 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={a.onScheda}><LayoutList className="mr-2 h-3.5 w-3.5" />Scheda</DropdownMenuItem>
        {completo && (
          <>
            <DropdownMenuItem onClick={a.onAcconto}><Euro className="mr-2 h-3.5 w-3.5" />Acconti</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onDocumenti}><Paperclip className="mr-2 h-3.5 w-3.5" />Documenti ({c.documenti.length})</DropdownMenuItem>
            <DropdownMenuItem onClick={a.onToggleCalcoli}>
              <Star className="mr-2 h-3.5 w-3.5" />{c.in_calcoli ? 'Togli dai Calcoli' : 'Aggiungi ai Calcoli'}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={a.onToggleInesigibile}>
          <Ban className="mr-2 h-3.5 w-3.5" />{c.inesigibile ? 'Togli inesigibile' : 'Segna inesigibile'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={a.onDuplica}><Copy className="mr-2 h-3.5 w-3.5" />Duplica</DropdownMenuItem>
        {altriGruppi.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {altriGruppi.map((g) => (
              <DropdownMenuItem key={g.id} onClick={() => a.onSposta(g.id)}>
                <MoveRight className="mr-2 h-3.5 w-3.5" />Sposta in {g.nome}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={a.onDelete} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 h-3.5 w-3.5" />Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Cliente({ c, onScheda, className = '' }: { c: CommessaCompleta; onScheda: () => void; className?: string }) {
  return (
    <button type="button" onClick={onScheda} className={`min-w-0 truncate text-left font-semibold text-gray-900 ${className}`}>
      {c.cliente_nome}
    </button>
  )
}

// ── A · Schede ──────────────────────────────────────────────────────────────

function Scheda({ c, azioni, preventiviById, altriGruppi, puoAprireProduzione, puoModificareStato }: PropsVoce) {
  const a = azioni(c)
  return (
    <div id={`commessa-m-${c.id}`} className={`space-y-2 rounded-lg border p-2.5 ${rigaClass(c) || 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <Cliente c={c} onScheda={a.onScheda} className="text-sm" />
        <div className="shrink-0"><BadgeStatoCommessa stato={c.stato} onChange={a.onStatoChange} modificabile={puoModificareStato} /></div>
      </div>
      <Meta c={c} puoAprireProduzione={puoAprireProduzione} />
      <Importi c={c} preventiviById={preventiviById} onScheda={a.onScheda} />
      <div className="flex items-center gap-1.5 border-t border-black/10 pt-2">
        <TastiRapidi c={c} a={a} />
        <span className="flex-1" />
        <MenuCommessa c={c} a={a} altriGruppi={altriGruppi} />
      </div>
    </div>
  )
}

// ── B · Righe compatte ──────────────────────────────────────────────────────

function RigaCompatta({ c, azioni, altriGruppi, puoAprireProduzione, puoModificareStato }: PropsVoce) {
  const a = azioni(c)
  return (
    <div id={`commessa-m-${c.id}`} className={`flex items-center gap-2 px-2.5 py-2 ${rigaClass(c)}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Cliente c={c} onScheda={a.onScheda} className="text-[13px]" />
          <span className={`shrink-0 text-[13px] font-bold tabular-nums ${coloreSaldo(c.saldo)}`}>{formatEuro(c.saldo)}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500">
          <NumeroCommessa c={c} puoAprireProduzione={puoAprireProduzione} />
          <span className="shrink-0"><BadgeStatoCommessa stato={c.stato} onChange={a.onStatoChange} modificabile={puoModificareStato} /></span>
          <span className="truncate tabular-nums">tot {formatEuro(c.totale)}</span>
        </div>
      </div>
      <MenuCommessa c={c} a={a} altriGruppi={altriGruppi} completo />
    </div>
  )
}

// ── C · Righe espandibili ───────────────────────────────────────────────────

function Espandibili(props: Props) {
  const { commesse, inAttesa = [], azioni, preventiviById, altriGruppi, puoAprireProduzione, puoModificareStato, anteprima } = props
  // Nell'anteprima la seconda riga e' gia' aperta, per far vedere com'e' il dettaglio.
  const [aperte, setAperte] = useState<Set<string>>(
    () => new Set(anteprima && commesse[1] ? [commesse[1].id] : []),
  )
  const apriChiudi = (id: string) =>
    setAperte((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-white">
      {commesse.map((c) => {
        const a = azioni(c)
        const aperta = aperte.has(c.id)
        return (
          <div key={c.id} id={`commessa-m-${c.id}`} className={rigaClass(c)}>
            <div className="flex items-center gap-1.5 px-2 py-2">
              <button
                type="button" onClick={() => apriChiudi(c.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-500"
                aria-label={aperta ? 'Chiudi il dettaglio' : 'Apri il dettaglio'} aria-expanded={aperta}
              >
                {aperta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <Cliente c={c} onScheda={a.onScheda} className="flex-1 text-[13px]" />
              <span className="shrink-0"><BadgeStatoCommessa stato={c.stato} onChange={a.onStatoChange} modificabile={puoModificareStato} /></span>
              <span className={`shrink-0 text-[13px] font-bold tabular-nums ${coloreSaldo(c.saldo)}`}>{formatEuro(c.saldo)}</span>
            </div>
            {aperta && (
              <div className="space-y-2 pb-2.5 pl-9 pr-2.5">
                <Meta c={c} puoAprireProduzione={puoAprireProduzione} />
                <Importi c={c} preventiviById={preventiviById} onScheda={a.onScheda} terzo="iva" />
                <div className="flex items-center gap-1.5">
                  <TastiRapidi c={c} a={a} />
                  <span className="flex-1" />
                  <MenuCommessa c={c} a={a} altriGruppi={altriGruppi} />
                </div>
              </div>
            )}
          </div>
        )
      })}
      {inAttesa.map((c) => <InAttesa key={c.id} c={c} riga />)}
    </div>
  )
}

/** Commessa creata offline: si vede, ma non si tocca finche' non e' sincronizzata. */
function InAttesa({ c, riga }: { c: CommessaCompleta; riga?: boolean }) {
  return (
    <div className={`flex items-center gap-2 bg-amber-50 px-2.5 py-2 opacity-80 ${riga ? '' : 'rounded-lg border'}`}>
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{c.cliente_nome}</span>
      <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">Da sincronizzare</span>
      <span className="shrink-0 text-[13px] tabular-nums">{formatEuro(c.totale)}</span>
    </div>
  )
}
