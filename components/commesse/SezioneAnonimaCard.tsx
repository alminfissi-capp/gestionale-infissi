'use client'

import { useState } from 'react'
import { ChevronDown, MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { totaliVendite } from '@/lib/vendite-anonime'
import { formatEuro } from '@/lib/pricing'
import { CANALI_VENDITA } from '@/types/commessa'
import type { SezioneConVendite, VenditaAnonima } from '@/types/commessa'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const LABEL_CANALE = new Map(CANALI_VENDITA.map((c) => [c.value, c.label]))

const formatData = (d: string) => {
  const [y, m, g] = d.split('-').map(Number)
  return new Date(y, m - 1, g).toLocaleDateString('it-IT')
}

/**
 * Raggruppa per anno-mese e ordina dal piu' recente. La chiave porta l'anno
 * perche' il nome del blocco non garantisce che le date stiano tutte li' dentro.
 */
function raggruppaPerMese(vendite: VenditaAnonima[]) {
  const gruppi = new Map<string, VenditaAnonima[]>()
  for (const v of vendite) {
    const chiave = v.data.slice(0, 7) // 'YYYY-MM'
    const lista = gruppi.get(chiave) ?? []
    lista.push(v)
    gruppi.set(chiave, lista)
  }
  return [...gruppi.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([chiave, righe]) => ({
      chiave,
      etichetta: `${MESI[Number(chiave.slice(5, 7)) - 1]} ${chiave.slice(0, 4)}`,
      righe,
    }))
}

interface Props {
  sezione: SezioneConVendite
  onRinomina: () => void
  onElimina: () => void
  onNuovaVendita: () => void
  onModificaVendita: (v: VenditaAnonima) => void
  onEliminaVendita: (v: VenditaAnonima) => void
}

export default function SezioneAnonimaCard({
  sezione, onRinomina, onElimina, onNuovaVendita, onModificaVendita, onEliminaVendita,
}: Props) {
  // Di default tutti i mesi chiusi: con centinaia di vendite la sezione deve
  // restare leggibile a colpo d'occhio.
  const [aperti, setAperti] = useState<Set<string>>(() => new Set())
  const toggle = (k: string) =>
    setAperti((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })

  const tot = totaliVendite(sezione.vendite)
  const mesi = raggruppaPerMese(sezione.vendite)

  return (
    <Card className="gap-2 py-3 border-indigo-200 bg-indigo-50/40">
      <CardHeader className="px-3 pb-0 gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate leading-tight">{sezione.nome}</h3>
            <p className="text-xs text-gray-500 leading-tight">
              {tot.numero} {tot.numero === 1 ? 'vendita' : 'vendite'} · commesse anonime
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-indigo-700" onClick={onNuovaVendita}>
              <Plus className="h-4 w-4 mr-1" />
              Nuova vendita
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRinomina}>Rinomina</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={tot.numero > 0}
                  className="text-red-600 focus:text-red-600 disabled:opacity-40"
                  onClick={onElimina}
                >
                  Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Totali della sezione */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-sm">
          <Totale etichetta="Incassato" valore={formatEuro(tot.lordo)} />
          <Totale etichetta="Imponibile" valore={formatEuro(tot.imponibile)} />
          <Totale etichetta="Materiale" valore={formatEuro(tot.materiale)} />
          <Totale etichetta="Manodopera" valore={formatEuro(tot.manodopera)} />
          <Totale
            etichetta={`Utile (${tot.margine.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)`}
            valore={formatEuro(tot.utile)}
            classe={tot.utile < 0 ? 'text-rose-600' : 'text-emerald-700'}
          />
        </div>
      </CardHeader>

      <CardContent className="px-3 space-y-1.5">
        {mesi.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">
            Nessuna vendita registrata in questa sezione.
          </p>
        ) : (
          mesi.map((m) => {
            const totMese = totaliVendite(m.righe)
            const aperto = aperti.has(m.chiave)
            return (
              <div key={m.chiave} className="rounded-md border bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(m.chiave)}
                  className="w-full flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-gray-50/70 border-b text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform ${aperto ? '' : '-rotate-90'}`}
                  />
                  <h4 className="text-sm font-semibold text-gray-700">{m.etichetta}</h4>
                  <Badge variant="secondary" className="text-[10px]">{totMese.numero}</Badge>
                  <span className="text-xs truncate ml-auto">
                    <span className="text-gray-600 font-medium">{formatEuro(totMese.lordo)}</span>
                    <span className={`font-medium ${totMese.utile < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {' · '}{formatEuro(totMese.utile)} di utile
                    </span>
                  </span>
                </button>

                {aperto && (
                  <div className="divide-y">
                    {m.righe.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 px-2 sm:px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                            {v.descrizione || '(senza descrizione)'}
                          </p>
                          <p className="text-xs text-gray-500 leading-tight">
                            {formatData(v.data)} · {LABEL_CANALE.get(v.canale) ?? v.canale}
                            {' · '}
                            {v.metodo_pagamento}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{formatEuro(v.lordo)}</p>
                          <p className="text-xs text-gray-500 leading-tight">
                            mat. {formatEuro(v.materiale)} · mano. {formatEuro(v.manodopera)}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-bold w-24 text-right shrink-0 ${
                            v.utile < 0 ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {formatEuro(v.utile)}
                        </p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onModificaVendita(v)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifica
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => onEliminaVendita(v)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function Totale({
  etichetta, valore, classe = 'text-gray-900',
}: { etichetta: string; valore: string; classe?: string }) {
  return (
    <div className="rounded-md bg-white border px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-none">{etichetta}</p>
      <p className={`text-sm font-bold leading-tight ${classe}`}>{valore}</p>
    </div>
  )
}
