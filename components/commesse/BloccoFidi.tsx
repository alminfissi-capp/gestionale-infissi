'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatEuro } from '@/lib/pricing'
import { riepilogoBanche, type AnticipoRow, type InfoCommessa, type LineaCreditoRow } from '@/lib/banche'
import { setAnticipoRimborsato, deleteAnticipo } from '@/actions/banche'
import DialogAnticipo from './DialogAnticipo'
import type { AnticipoFattura, LineaCredito, OpzioneCommessa } from '@/types/commessa'

// Un anticipo può coprire più commesse: si elencano tutte, perché il residuo mostrato
// accanto è la loro somma e senza i nomi non si capirebbe di chi.
function etichettaAnticipo(a: { commesse: { etichetta: string }[]; descrizione: string }): string {
  if (a.commesse.length > 0) return a.commesse.map((c) => c.etichetta).join(' + ')
  return a.descrizione || 'Anticipo'
}

// Le date arrivano come 'YYYY-MM-DD' dal server. Si formattano all'italiana solo per
// mostrarle: i confronti restano sulle stringhe ISO, che si ordinano da sole. Niente
// `new Date(...)`, che su una data senza ora sposta il giorno cambiando fuso.
function formatData(iso: string): string {
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

interface Props {
  linee: LineaCredito[]
  anticipi: AnticipoFattura[] // compresi i rimborsati
  commesse: OpzioneCommessa[]
  oggi: string // 'YYYY-MM-DD' dal Server Component
}

export default function BloccoFidi({ linee, anticipi, commesse, oggi }: Props) {
  const router = useRouter()
  const [mostraRimborsati, setMostraRimborsati] = useState(false)
  const [dialogAperto, setDialogAperto] = useState(false)
  const [inModifica, setInModifica] = useState<AnticipoFattura | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const perId = useMemo(() => new Map(anticipi.map((a) => [a.id, a])), [anticipi])

  const infoCommesse = useMemo(() => {
    const map: Record<string, InfoCommessa> = {}
    for (const c of commesse) map[c.id] = { etichetta: c.etichetta, residuo: c.residuo }
    return map
  }, [commesse])

  const riepilogo = useMemo(() => {
    const righeLinee: LineaCreditoRow[] = linee.map((l) => ({
      id: l.id, nome: l.nome, tipo: l.tipo, accordato: l.accordato,
    }))
    const righeAnticipi: AnticipoRow[] = anticipi.map((a) => ({
      id: a.id, linea_id: a.linea_id, commesse_ids: a.commesse_ids, descrizione: a.descrizione,
      importo: a.importo, data_scadenza: a.data_scadenza, rimborsato: a.rimborsato,
    }))
    return riepilogoBanche([], righeLinee, righeAnticipi, infoCommesse, oggi)
  }, [linee, anticipi, infoCommesse, oggi])

  const rimborsatiPerLinea = useMemo(() => {
    const map = new Map<string, AnticipoFattura[]>()
    for (const a of anticipi) {
      if (!a.rimborsato) continue
      const list = map.get(a.linea_id) ?? []
      list.push(a)
      map.set(a.linea_id, list)
    }
    return map
  }, [anticipi])

  const handleRimborso = async (a: AnticipoFattura, valore: boolean) => {
    setPendingId(a.id)
    try {
      await setAnticipoRimborsato(a.id, valore)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setPendingId(null)
    }
  }

  const handleElimina = async (a: AnticipoFattura) => {
    if (!confirm('Eliminare questo anticipo?')) return
    setPendingId(a.id)
    try {
      await deleteAnticipo(a.id)
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setPendingId(null)
    }
  }

  const apri = (a: AnticipoFattura | null) => {
    setInModifica(a)
    setDialogAperto(true)
  }

  if (linee.length === 0) return null

  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/60">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-amber-600" />
          Fidi e anticipi
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <Checkbox
              checked={mostraRimborsati}
              onCheckedChange={(v) => setMostraRimborsati(v === true)}
            />
            Mostra i rimborsati
          </label>
          <Button variant="outline" size="sm" onClick={() => apri(null)}>
            <Plus className="h-4 w-4 mr-1" />
            Anticipo
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {riepilogo.linee.map((l) => {
          const chiusi = rimborsatiPerLinea.get(l.id) ?? []
          return (
            <div key={l.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-800">{l.nome}</span>
                <span className="text-xs text-gray-500">
                  plafond {formatEuro(l.accordato)} · utilizzato{' '}
                  <span className="font-semibold text-amber-700">{formatEuro(l.utilizzato)}</span> ·
                  residuo <span className="font-semibold text-emerald-700">{formatEuro(l.residuo)}</span>
                </span>
              </div>

              {l.anticipi.length === 0 && chiusi.length === 0 && (
                <p className="mt-2 text-xs text-gray-400">Nessun anticipo su questa linea</p>
              )}

              <ul className="mt-2 space-y-1">
                {l.anticipi.map((a) => {
                  const originale = perId.get(a.id)
                  if (!originale) return null
                  const inCorso = pendingId === a.id
                  return (
                    <li
                      key={a.id}
                      className={`flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm ${
                        a.scaduto ? 'bg-rose-50' : a.daChiudere ? 'bg-amber-50' : 'bg-gray-50/60'
                      }`}
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => handleRimborso(originale, true)}
                        disabled={inCorso}
                        title="Segna come rimborsato"
                        aria-label="Segna come rimborsato"
                      />
                      <span className="flex-1 min-w-0 truncate text-gray-700">
                        {etichettaAnticipo(a)}
                      </span>
                      {a.data_scadenza && (
                        <span className={`shrink-0 ${a.scaduto ? 'text-rose-600' : 'text-gray-400'}`}>
                          scad. {formatData(a.data_scadenza)}{a.scaduto && ' · scaduto'}
                        </span>
                      )}
                      {a.residuoCommesse !== null && (
                        <span className="text-xs text-gray-500 shrink-0">
                          il cliente deve {formatEuro(a.residuoCommesse)}
                        </span>
                      )}
                      <span className="font-semibold text-gray-800 shrink-0">{formatEuro(a.importo)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-700 shrink-0" disabled={inCorso} title="Modifica" aria-label="Modifica anticipo" onClick={() => apri(originale)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-300 hover:text-red-500 shrink-0" disabled={inCorso} title="Elimina" aria-label="Elimina anticipo" onClick={() => handleElimina(originale)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {a.daChiudere && !a.scaduto && (
                        <p className="w-full text-xs text-amber-700">
                          Il cliente ha saldato: la banca dovrebbe essere rientrata
                        </p>
                      )}
                    </li>
                  )
                })}

                {mostraRimborsati && chiusi.length > 0 && (
                  <li className="px-2 pt-2 text-xs text-gray-400">Rimborsati</li>
                )}
                {mostraRimborsati && chiusi.map((a) => {
                  const inCorso = pendingId === a.id
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-400 line-through">
                      <Checkbox
                        checked
                        onCheckedChange={() => handleRimborso(a, false)}
                        disabled={inCorso}
                        title="Riapri l'anticipo"
                        aria-label="Riapri l'anticipo"
                      />
                      <span className="flex-1 min-w-0 truncate">{a.descrizione || 'Anticipo'}</span>
                      <span className="shrink-0">{formatEuro(a.importo)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      <p className="px-4 py-2 border-t bg-gray-50/60 text-xs text-gray-500">
        Gli anticipi non entrano nella liquidità corrente: il residuo di un plafond diventa
        cassa solo presentando fatture.
      </p>

      {dialogAperto && (
        <DialogAnticipo
          key={inModifica?.id ?? 'nuovo'}
          open={dialogAperto}
          onOpenChange={setDialogAperto}
          linee={linee}
          commesse={commesse}
          anticipo={inModifica}
        />
      )}
    </div>
  )
}
