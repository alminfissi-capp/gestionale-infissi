'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ComboboxField } from '@/components/ui/combobox-field'
import { createAnticipo, updateAnticipo, getAccontiPerCommesse } from '@/actions/banche'
import { formatEuro, parseImporto } from '@/lib/pricing'
import type {
  AnticipoFattura, LineaCredito, OpzioneCommessa, AccontoSelezionabile,
} from '@/types/commessa'
import { Checkbox } from '@/components/ui/checkbox'

// Le date arrivano come 'YYYY-MM-DD' dal server: si formattano all'italiana solo per
// mostrarle, senza `new Date(...)`, che su una data senza ora sposta il giorno col fuso.
function formatData(iso: string): string {
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  linee: LineaCredito[]
  commesse: OpzioneCommessa[]
  anticipo: AnticipoFattura | null // null = nuovo
}

export default function DialogAnticipo({ open, onOpenChange, linee, commesse, anticipo }: Props) {
  const router = useRouter()
  const [lineaId, setLineaId] = useState(anticipo?.linea_id ?? linee[0]?.id ?? '')
  const [commesseIds, setCommesseIds] = useState<string[]>(anticipo?.commesse_ids ?? [])
  const [descrizione, setDescrizione] = useState(anticipo?.descrizione ?? '')
  const [importo, setImporto] = useState(anticipo ? String(anticipo.importo) : '')
  const [erogazione, setErogazione] = useState(anticipo?.data_erogazione ?? '')
  const [scadenza, setScadenza] = useState(anticipo?.data_scadenza ?? '')
  const [saving, setSaving] = useState(false)
  // Gli acconti che la banca ha trattenuto per rientrare: scelta manuale, perché
  // non sempre la banca li trattiene.
  const [accontiIds, setAccontiIds] = useState<string[]>(anticipo?.acconti_ids ?? [])
  const [acconti, setAcconti] = useState<AccontoSelezionabile[]>([])
  const [caricandoAcconti, setCaricandoAcconti] = useState(false)

  // Si ricaricano quando cambiano le commesse collegate: gli acconti da cui scegliere
  // sono quelli incassati su quelle commesse.
  useEffect(() => {
    if (commesseIds.length === 0) {
      setAcconti([])
      return
    }
    let annullato = false
    setCaricandoAcconti(true)
    getAccontiPerCommesse(commesseIds)
      .then((elenco) => {
        if (annullato) return
        setAcconti(elenco)
        // Se una commessa viene tolta, i suoi acconti non sono più scegliibili:
        // vanno anche deselezionati, altrimenti resterebbero scalati di nascosto.
        const presenti = new Set(elenco.map((a) => a.id))
        setAccontiIds((cur) => cur.filter((id) => presenti.has(id)))
      })
      .catch(() => {
        if (!annullato) toast.error('Errore nel caricamento degli acconti')
      })
      .finally(() => {
        if (!annullato) setCaricandoAcconti(false)
      })
    return () => { annullato = true }
  }, [commesseIds])

  const scalato = acconti
    .filter((a) => accontiIds.includes(a.id))
    .reduce((s, a) => s + a.importo, 0)
  const daRestituire = Math.max(0, parseImporto(importo) - scalato)

  // Una fattura può coprire più commesse: si sommano i loro residui, così si vede
  // subito quanto il cliente deve ancora rispetto a quanto si deve alla banca.
  const selezionate = commesseIds.flatMap((id) => commesse.find((c) => c.id === id) ?? [])
  const residuoTotale = selezionate.reduce((s, c) => s + c.residuo, 0)
  const disponibili = commesse.filter((c) => !commesseIds.includes(c.id))

  const aggiungiCommessa = (id: string) => {
    if (!id || commesseIds.includes(id)) return
    setCommesseIds((cur) => [...cur, id])
  }

  const handleSalva = async () => {
    if (!lineaId) { toast.error('Scegli la linea di credito'); return }
    const valore = parseImporto(importo)
    if (valore <= 0) { toast.error("Inserisci l'importo anticipato"); return }
    setSaving(true)
    try {
      const input = {
        linea_id: lineaId,
        commesse_ids: commesseIds,
        acconti_ids: accontiIds,
        descrizione,
        importo: valore,
        data_erogazione: erogazione || null,
        data_scadenza: scadenza || null,
      }
      if (anticipo) await updateAnticipo(anticipo.id, input)
      else await createAnticipo(input)
      toast.success(anticipo ? 'Anticipo aggiornato' : 'Anticipo aggiunto')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{anticipo ? 'Modifica anticipo' : 'Nuovo anticipo fattura'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Linea di credito</Label>
            <Select value={lineaId} onValueChange={setLineaId}>
              <SelectTrigger><SelectValue placeholder="Scegli la linea" /></SelectTrigger>
              <SelectContent>
                {linee.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Commesse</Label>
            {selezionate.length > 0 && (
              <ul className="space-y-1">
                {selezionate.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded border bg-gray-50/60 px-2 py-1.5 text-sm"
                  >
                    <span className="flex-1 min-w-0 truncate text-gray-700">{c.etichetta}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      deve {formatEuro(c.residuo)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-gray-300 hover:text-red-500"
                      title="Togli questa commessa"
                      aria-label={`Togli ${c.etichetta}`}
                      onClick={() => setCommesseIds((cur) => cur.filter((x) => x !== c.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <ComboboxField
              key={commesseIds.length}
              options={disponibili.map((c) => ({ value: c.id, label: c.etichetta }))}
              value=""
              onChange={aggiungiCommessa}
              placeholder={selezionate.length > 0 ? 'Aggiungi un’altra commessa…' : 'Nessuna commessa collegata'}
              searchPlaceholder="Cerca per numero o cliente…"
            />
            {selezionate.length > 0 && (
              <p className="text-xs text-gray-500">
                {selezionate.length === 1
                  ? `Il cliente deve ancora saldare ${formatEuro(residuoTotale)}`
                  : `In tutto il cliente deve ancora saldare ${formatEuro(residuoTotale)} su ${selezionate.length} commesse`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Importo anticipato</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={importo}
              placeholder="0,00"
              onChange={(e) => setImporto(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Erogato il</Label>
              <Input type="date" value={erogazione} onChange={(e) => setErogazione(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza</Label>
              <Input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={descrizione}
              placeholder="Es. fattura 214/2026"
              onChange={(e) => setDescrizione(e.target.value)}
            />
          </div>

          {/* Rientri: quali acconti del cliente la banca ha trattenuto */}
          <div className="space-y-1.5 border-t pt-3">
            <Label>Acconti trattenuti dalla banca</Label>
            <p className="text-xs text-gray-500">
              Spunta gli acconti che la banca ha trattenuto per rientrare: scalano quello
              che le devi. Se un acconto lo hai incassato tu, lascialo com&apos;è.
            </p>

            {commesseIds.length === 0 ? (
              <p className="text-xs text-gray-400">
                Collega prima una commessa: gli acconti da scegliere sono i suoi.
              </p>
            ) : caricandoAcconti ? (
              <p className="text-xs text-gray-400">Carico gli acconti…</p>
            ) : acconti.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nessun acconto ancora incassato su queste commesse.
              </p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto rounded border p-1">
                {acconti.map((a) => {
                  // Un acconto rientra su un solo anticipo: se se l'è già preso un altro,
                  // qui non si può spuntare, altrimenti gli stessi soldi rientrerebbero due volte.
                  const altrove = a.anticipo_id !== null && a.anticipo_id !== anticipo?.id
                  const scelto = accontiIds.includes(a.id)
                  return (
                    <li
                      key={a.id}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                        altrove ? 'opacity-50' : scelto ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <Checkbox
                        checked={scelto}
                        disabled={altrove}
                        aria-label={`Acconto del ${formatData(a.data_pagamento)} da ${formatEuro(a.importo)}`}
                        onCheckedChange={(v) =>
                          setAccontiIds((cur) =>
                            v === true ? [...cur, a.id] : cur.filter((x) => x !== a.id),
                          )
                        }
                      />
                      <span className="flex-1 min-w-0 truncate">
                        <span className="text-gray-700">{formatData(a.data_pagamento)}</span>
                        <span className="text-gray-400"> · {a.etichettaCommessa}</span>
                        {altrove && (
                          <span className="text-amber-700"> · già su un altro anticipo</span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium text-gray-800">
                        {formatEuro(a.importo)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {scalato > 0 && (
              <p className="text-xs text-gray-600">
                Rientrati <span className="font-medium text-emerald-700">{formatEuro(scalato)}</span>
                {' '}· resta da restituire alla banca{' '}
                <span className="font-semibold text-amber-700">{formatEuro(daRestituire)}</span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSalva} disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
