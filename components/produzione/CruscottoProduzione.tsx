'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Factory, AlertTriangle, FileText, Package, Search,
  BarChart3, MessageSquare, ClipboardList, Archive, ArchiveRestore, ArrowLeft,
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import GraficoAvanzamento from '@/components/produzione/GraficoAvanzamento'
import { setArchiviataCommessa } from '@/actions/produzione'
import type { OrdineConCommessa, CommessaProduzione } from '@/types/produzione'

interface Props {
  daFare: OrdineConCommessa[]
  commesse: CommessaProduzione[]
  statoFiltro: string
  archiviate: boolean
}

const OPZIONI_FILTRO = [
  { value: 'aperte', label: 'Aperte' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'da_iniziare', label: 'Da iniziare' },
  { value: 'tutte', label: 'Tutte' },
]

const ORDINAMENTI = [
  { value: 'numero_desc', label: 'Numero ↓' },
  { value: 'numero_asc', label: 'Numero ↑' },
  { value: 'data_desc', label: 'Data ↓' },
  { value: 'data_asc', label: 'Data ↑' },
] as const
type Ordinamento = (typeof ORDINAMENTI)[number]['value']
const STORAGE_KEY = 'produzione:ordinamento'

// "NN-YYYY" → { anno, numero }. Le commesse senza numero valido vanno in fondo.
function chiaveNumero(numero: string): { valido: boolean; anno: number; n: number } {
  const m = /^(\d+)-(\d{4})$/.exec((numero || '').trim())
  if (!m) return { valido: false, anno: 0, n: 0 }
  return { valido: true, anno: Number(m[2]), n: Number(m[1]) }
}

function comparatore(ord: Ordinamento) {
  return (a: CommessaProduzione, b: CommessaProduzione): number => {
    if (ord === 'numero_asc' || ord === 'numero_desc') {
      const ka = chiaveNumero(a.numero_commessa)
      const kb = chiaveNumero(b.numero_commessa)
      if (ka.valido !== kb.valido) return ka.valido ? -1 : 1 // invalidi sempre in fondo
      if (!ka.valido) return 0
      const diff = ka.anno !== kb.anno ? ka.anno - kb.anno : ka.n - kb.n
      return ord === 'numero_asc' ? diff : -diff
    }
    const da = a.data_conferma ? new Date(a.data_conferma).getTime() : null
    const db = b.data_conferma ? new Date(b.data_conferma).getTime() : null
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    return ord === 'data_asc' ? da - db : db - da
  }
}

export default function CruscottoProduzione({ daFare, commesse, statoFiltro, archiviate }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ricerca, setRicerca] = useState('')
  const [ordinamento, setOrdinamento] = useState<Ordinamento>('numero_desc')

  // Ripristina l'ordinamento salvato dopo il mount (niente mismatch di idratazione).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && ORDINAMENTI.some((o) => o.value === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrdinamento(saved as Ordinamento)
    }
  }, [])

  const cambiaOrdinamento = (v: Ordinamento) => {
    setOrdinamento(v)
    localStorage.setItem(STORAGE_KEY, v)
  }

  const cambiaFiltro = (valore: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('stato', valore)
    router.push(`/produzione?${params.toString()}`)
  }

  const vaiArchivio = (on: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (on) params.set('archiviate', '1')
    else params.delete('archiviate')
    router.push(`/produzione?${params.toString()}`)
  }

  const toggleArchivia = async (id: string, archivia: boolean) => {
    try {
      await setArchiviataCommessa(id, archivia)
      toast.success(archivia ? 'Commessa archiviata' : 'Commessa ripristinata')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  const q = ricerca.trim().toLowerCase()
  const commesseFiltrate = q
    ? commesse.filter(
        (c) =>
          (c.numero_commessa || '').toLowerCase().includes(q) ||
          (c.cliente_nome || '').toLowerCase().includes(q)
      )
    : commesse
  const commesseOrdinate = [...commesseFiltrate].sort(comparatore(ordinamento))

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Produzione</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Documenti, file e ordini fornitori delle commesse
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/produzione/calendario">
            <CalendarDays className="mr-1 h-4 w-4" />
            Calendario
          </Link>
        </Button>
      </div>

      {/* Zona superiore: statistiche + da fare + messaggi */}
      <section className="grid gap-3 lg:grid-cols-3">
        {/* Statistiche (segnaposto grafico) */}
        <div className="lg:col-span-2 flex min-h-[240px] flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Statistiche</h2>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-sm">Grafico in arrivo</p>
          </div>
        </div>

        {/* Colonna destra: da fare + messaggi */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Da fare</h2>
              {daFare.length > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {daFare.length}
                </span>
              )}
            </div>
            {daFare.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Niente da fare.</p>
            ) : (
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {daFare.map((o) => (
                  <Link
                    key={o.id}
                    href={`/produzione/${o.commessa_id}`}
                    className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-800 p-2 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    {o.in_ritardo ? (
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {o.numero_commessa || 'commessa'} — {o.fornitore_nome ?? 'fornitore n.d.'}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {o.cliente_nome}
                        {o.in_ritardo && o.data_consegna_prevista
                          ? ` · in ritardo dal ${o.data_consegna_prevista}`
                          : ' · da ordinare'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Messaggi (segnaposto) */}
          <div className="flex flex-1 flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Messaggi</h2>
            </div>
            <div className="flex flex-1 items-center justify-center py-4 text-sm text-gray-400 dark:text-gray-500">
              Nessun messaggio dalla produzione.
            </div>
          </div>
        </div>
      </section>

      {/* Zona inferiore: ricerca + filtri + commesse */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {archiviate ? 'Commesse archiviate' : 'Commesse'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {!archiviate && (
              <div className="flex gap-1">
                {OPZIONI_FILTRO.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => cambiaFiltro(o.value)}
                    className={
                      statoFiltro === o.value
                        ? 'rounded-md px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                        : 'rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <Select value={ordinamento} onValueChange={(v) => cambiaOrdinamento(v as Ordinamento)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDINAMENTI.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {archiviate ? (
              <button
                onClick={() => vaiArchivio(false)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Attive
              </button>
            ) : (
              <button
                onClick={() => vaiArchivio(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                <Archive className="h-3.5 w-3.5" /> Archiviate
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca commessa per numero o cliente..."
            className="pl-9"
          />
        </div>

        {commesse.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            {archiviate ? 'Nessuna commessa archiviata.' : 'Nessuna commessa con questo filtro.'}
          </p>
        ) : commesseOrdinate.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessuna commessa trovata per &quot;{ricerca}&quot;.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {commesseOrdinate.map((c) => (
              <div
                key={c.id}
                className="relative rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <Link href={`/produzione/${c.id}`} className="flex items-center gap-3 p-3 pr-10">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                      {c.numero_commessa || 'Senza numero'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.cliente_nome}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" /> {c.ordini_aperti}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> {c.documenti}
                      </span>
                      {c.ordini_in_ritardo > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> {c.ordini_in_ritardo}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Avanzamento delle fasi: a colpo d'occhio, coi colori delle attività */}
                  <GraficoAvanzamento avanzamento={c.avanzamento} dimensione={46} spessore={7} />
                </Link>
                <button
                  onClick={() => toggleArchivia(c.id, !archiviate)}
                  className="absolute top-2 right-2 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
                  title={archiviate ? 'Ripristina' : 'Archivia'}
                  aria-label={archiviate ? 'Ripristina' : 'Archivia'}
                >
                  {archiviate ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
