'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Plus, Star, Paperclip, MoreVertical, GripVertical } from 'lucide-react'
import { formatEuro } from '@/lib/pricing'
import { rigaClass } from '@/lib/commesse-vista'
import ElencoCommesseMobile, { type AzioniCommessaMobile } from '@/components/commesse/ElencoCommesseMobile'
import { setVistaCommesseMobile } from '@/actions/preferenze'
import { VISTE_COMMESSE_MOBILE, type VistaCommesseMobile } from '@/types/preferenze'
import type { CommessaCompleta, PreventivoPerCommessa } from '@/types/commessa'

/*
 * Scelta di come vedere l'elenco commesse sul telefono. Le anteprime sono il
 * componente vero dell'elenco con dati d'esempio: quello che si vede qui e'
 * quello che si avra'.
 */

const nessunaAzione: AzioniCommessaMobile = {
  onScheda: () => {}, onAcconto: () => {}, onDocumenti: () => {}, onToggleCalcoli: () => {},
  onToggleInesigibile: () => {}, onStatoChange: () => {}, onDuplica: () => {}, onDelete: () => {}, onSposta: () => {},
}
const nessunPreventivo = new Map<string, PreventivoPerCommessa>()

function esempio(
  id: string, cliente: string, numero: string, mese: string, totale: number, acconti: number,
  stato: CommessaCompleta['stato'], extra: Partial<CommessaCompleta> = {},
): CommessaCompleta {
  return {
    id, cliente_nome: cliente, numero_commessa: numero, data_conferma: mese, totale, iva_totale: Math.round(totale / 11 * 100) / 100,
    imponibile: totale, totale_acconti: acconti, saldo: Math.round((totale - acconti) * 100) / 100, stato,
    operatore_nome: 'G', in_calcoli: false, inesigibile: false, documenti: [], acconti: [], reparti: [],
    preventivi_collegati: [{ id: `p${id}`, numero_preventivo: `PRE WIN ${300 - Number(id)}/2026`, preventivo_id: null }],
    ...extra,
  } as unknown as CommessaCompleta
}

const ESEMPI: CommessaCompleta[] = [
  esempio('1', 'ROSSI MARIO', '05-2026', '2026-10-01', 22746.88, 11373.44, 'da_iniziare'),
  esempio('2', 'BIANCHI SRL', '04-2026', '2026-09-01', 8540, 8540, 'concluso', { in_calcoli: true }),
  esempio('3', 'VERDI LUCA', '03-2026', '2026-09-01', 9800, 6600, 'in_lavorazione'),
  esempio('4', 'COND. VIA ROMA 12', '02-2026', '2026-08-01', 15300, 14150, 'da_consegnare'),
  esempio('5', 'ESPOSITO ANNA', '01-2026', '2026-07-01', 6980, 4500, 'in_lavorazione'),
]

export default function SceltaVistaCommesse({ iniziale }: { iniziale: VistaCommesseMobile }) {
  const [scelta, setScelta] = useState<VistaCommesseMobile>(iniziale)
  const [pending, startTransition] = useTransition()

  function scegli(v: VistaCommesseMobile) {
    if (v === scelta) return
    const prima = scelta
    setScelta(v)
    startTransition(async () => {
      try {
        const r = await setVistaCommesseMobile(v)
        if (!r.ok) { setScelta(prima); toast.error(r.errore); return }
        toast.success('Visualizzazione salvata: la vedrai nell’elenco commesse sul telefono')
      } catch {
        setScelta(prima)
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  return (
    <div role="radiogroup" aria-label="Visualizzazione dell'elenco commesse sul telefono" className="grid gap-3 sm:grid-cols-2">
      {VISTE_COMMESSE_MOBILE.map((v) => {
        const attiva = scelta === v.valore
        return (
          // Contenitore cliccabile e non <button>: l'anteprima contiene a sua volta dei tasti.
          <div
            key={v.valore}
            role="radio"
            tabIndex={0}
            aria-checked={attiva}
            aria-disabled={pending || undefined}
            onClick={() => { if (!pending) scegli(v.valore) }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !pending) { e.preventDefault(); scegli(v.valore) }
            }}
            className={`flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${pending ? 'opacity-70' : ''} ${
              attiva ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30' : 'border-transparent hover:border-gray-300'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{v.titolo}</span>
              {attiva && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-medium text-white">
                  <Check className="h-3 w-3" /> In uso
                </span>
              )}
            </span>
            <span className="min-h-[3em] text-xs text-muted-foreground">{v.descrizione}</span>
            {/* Cornice del telefono con l'elenco vero e dati d'esempio */}
            {/* Cornice del telefono: l'elenco si disegna largo come un telefono vero (340px)
                e si rimpicciolisce in proporzione, cosi' l'anteprima e' una "foto" fedele. */}
            <div className="mx-auto w-fit rounded-[22px] bg-gray-900 p-1.5 shadow-md">
              <div className="overflow-hidden rounded-[17px] bg-gray-50" style={{ zoom: 0.58 }}>
                <div className="h-[640px] w-[340px] overflow-hidden">
                <div className="bg-[#0E8F9C] px-3 py-1.5 text-xs text-white">Commesse · 2026</div>
                <div className="p-2.5">
                  {v.valore === 'tabella' ? <AnteprimaTabella /> : <ElencoCommesseMobile
                    vista={v.valore}
                    commesse={ESEMPI}
                    azioni={() => nessunaAzione}
                    preventiviById={nessunPreventivo}
                    altriGruppi={[]}
                    puoAprireProduzione={false}
                    puoModificareStato={false}
                    anteprima
                  />}
                </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * La tabella del PC vista da un telefono: le prime colonne, il resto oltre il
 * bordo destro (si scorre di lato). Disegno statico: la tabella vera porta con
 * se' trascinamento e finestre che in un'anteprima non servono.
 */
function AnteprimaTabella() {
  return (
    <div className="pointer-events-none select-none overflow-hidden rounded-md border bg-white" inert>
      <table className="w-[620px] table-fixed text-[13px]">
        <colgroup>
          <col className="w-6" /><col className="w-[150px]" /><col className="w-[120px]" />
          <col className="w-[100px]" /><col className="w-[110px]" /><col className="w-[110px]" />
        </colgroup>
        <thead>
          <tr className="border-b text-left text-[12px] text-gray-500">
            <th /><th className="py-2">Cliente</th><th>N. Prev.</th>
            <th className="text-right">Totale</th><th className="text-right">Acconti</th><th className="pr-2 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {ESEMPI.map((c) => (
            <tr key={c.id} className={`border-b ${rigaClass(c)}`}>
              <td className="pl-1 text-gray-300"><GripVertical className="h-3.5 w-3.5" /></td>
              <td className="truncate py-2.5 font-medium">{c.cliente_nome}</td>
              <td>
                <span className="rounded border border-gray-200 bg-gray-100 px-1 font-mono text-[11px] text-gray-600">
                  {c.preventivi_collegati[0]?.numero_preventivo}
                </span>
              </td>
              <td className="text-right font-semibold tabular-nums">{formatEuro(c.totale)}</td>
              <td className="text-right tabular-nums">
                {formatEuro(c.totale_acconti)} <Plus className="inline h-3 w-3 text-gray-400" />
              </td>
              <td className="pr-2 text-right">
                <span className={`rounded-full px-1.5 text-[12px] font-semibold tabular-nums ${
                  c.saldo > 0.005 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                }`}>{formatEuro(c.saldo)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-1.5 px-2 py-2 text-[12px] text-gray-500">
        <Star className="h-3 w-3" /><Paperclip className="h-3 w-3" /><MoreVertical className="h-3 w-3" />
        … e le altre colonne scorrendo di lato →
      </p>
    </div>
  )
}
