'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  cercaDocumentiPerCosti, getRigheDocumento, salvaAttribuzioni,
  type DocumentoPerCosti, type RigaDocumento,
} from '@/actions/contabilita-commessa'
import { importoRiga } from '@/lib/contabilita-commessa'
import { fornitoreCorrisponde, parseImporto } from '@/lib/fic/pagamenti'
import { formatData } from '@/lib/fic/formato'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { formatEuro } from '@/lib/pricing'
import { CATEGORIE_COSTO, type CategoriaCosto } from '@/types/contabilita'

/** Periodo iniziale: da 2 mesi prima della conferma della commessa a oggi. */
function periodoIniziale(dataConferma: string | null): { dal: string; al: string } {
  const al = oggiRoma()
  const base = dataConferma ?? al
  const d = new Date(`${base.slice(0, 10)}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 2)
  return { dal: d.toISOString().slice(0, 10), al }
}

type Scelta = { quantita: number; testo?: string; categoria: CategoriaCosto | null }

export default function DialogArticoliFattura({
  commessaId, dataConferma, ficIdIniziale, onClose,
}: {
  commessaId: string
  dataConferma: string | null
  /** Se valorizzato apre direttamente quel documento (modifica). */
  ficIdIniziale: number | null
  onClose: () => void
}) {
  const router = useRouter()
  const iniziale = periodoIniziale(dataConferma)
  const [dal, setDal] = useState(iniziale.dal)
  const [al, setAl] = useState(iniziale.al)
  const [ricerca, setRicerca] = useState('')
  const [documenti, setDocumenti] = useState<DocumentoPerCosti[] | null>(null)
  const [aperto, setAperto] = useState<{ documento: DocumentoPerCosti; righe: RigaDocumento[] } | null>(null)
  const [scelte, setScelte] = useState<Record<number, Scelta>>({})
  const [caricando, setCaricando] = useState(false)
  const [pending, startTransition] = useTransition()

  function caricaDocumenti(p: { dal: string; al: string }) {
    if (!p.dal || !p.al || p.dal > p.al || p.dal < '2000-01-01') return
    setCaricando(true)
    cercaDocumentiPerCosti(commessaId, p)
      .then((r) => { if ('errore' in r) toast.error(r.errore); else setDocumenti(r) })
      .catch(() => toast.error('Connessione interrotta: riprova'))
      .finally(() => setCaricando(false))
  }

  function apriDocumento(ficId: number) {
    setCaricando(true)
    getRigheDocumento(commessaId, ficId)
      .then((r) => {
        if ('errore' in r) { toast.error(r.errore); return }
        setAperto(r)
        setScelte(Object.fromEntries(
          r.righe.filter((x) => x.attribuitaQui !== null)
            .map((x) => [x.riga_id, { quantita: x.attribuitaQui!, categoria: x.categoriaQui }]),
        ))
      })
      .catch(() => toast.error('Connessione interrotta: riprova'))
      .finally(() => setCaricando(false))
  }

  // Prima apertura: elenco dei documenti del periodo, oppure direttamente il documento da modificare.
  useEffect(() => {
    let vivo = true
    const p = periodoIniziale(dataConferma)
    const lavoro = ficIdIniziale !== null
      ? getRigheDocumento(commessaId, ficIdIniziale).then((r) => {
        if (!vivo) return
        if ('errore' in r) { toast.error(r.errore); return }
        setAperto(r)
        setScelte(Object.fromEntries(
          r.righe.filter((x) => x.attribuitaQui !== null)
            .map((x) => [x.riga_id, { quantita: x.attribuitaQui!, categoria: x.categoriaQui }]),
        ))
      })
      : cercaDocumentiPerCosti(commessaId, p).then((r) => {
        if (!vivo) return
        if ('errore' in r) toast.error(r.errore)
        else setDocumenti(r)
      })
    lavoro.catch(() => { if (vivo) toast.error('Connessione interrotta: riprova') })
    return () => { vivo = false }
  }, [commessaId, dataConferma, ficIdIniziale])

  const visibili = useMemo(
    () => (documenti ?? []).filter((d) => {
      const q = ricerca.trim()
      if (!q) return true
      return fornitoreCorrisponde(q, d.fornitore_nome) || (d.numero ?? '').toLowerCase().includes(q.toLowerCase())
    }),
    [documenti, ricerca],
  )

  function spunta(r: RigaDocumento, si: boolean) {
    setScelte((s) => {
      const n = { ...s }
      if (si) n[r.riga_id] = { quantita: r.rimanente > 0 ? r.rimanente : r.quantita, categoria: r.categoriaQui ?? r.categoriaProposta }
      else delete n[r.riga_id]
      return n
    })
  }

  function cambia(id: number, campo: Partial<Scelta>) {
    setScelte((s) => ({ ...s, [id]: { ...s[id], ...campo } }))
  }

  const tipo = aperto?.documento.tipo ?? 'fattura'
  const totale = aperto
    ? aperto.righe.reduce((t, r) => (scelte[r.riga_id] ? t + importoRiga(scelte[r.riga_id].quantita, r.prezzo, tipo) : t), 0)
    : 0
  const senzaCategoria = Object.values(scelte).some((s) => !s.categoria)

  function salva() {
    if (!aperto) return
    const lista = Object.entries(scelte).map(([id, s]) => ({ riga_id: Number(id), quantita: s.quantita, categoria: s.categoria as CategoriaCosto }))
    startTransition(async () => {
      try {
        const r = await salvaAttribuzioni(commessaId, aperto.documento.fic_id, lista)
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Costi della commessa aggiornati')
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{aperto ? 'Articoli da attribuire alla commessa' : 'Aggiungi da fattura'}</DialogTitle>
        </DialogHeader>

        {!aperto && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="cc-cerca">Fornitore o numero</Label>
                <Input id="cc-cerca" className="w-56" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-dal">Dal</Label>
                <Input id="cc-dal" type="date" className="w-40" value={dal} onChange={(e) => setDal(e.target.value)}
                  onBlur={() => caricaDocumenti({ dal, al })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-al">al</Label>
                <Input id="cc-al" type="date" className="w-40" value={al} onChange={(e) => setAl(e.target.value)}
                  onBlur={() => caricaDocumenti({ dal, al })} />
              </div>
              {caricando && <Loader2 className="mb-2 h-4 w-4 animate-spin" />}
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-md border">
              {documenti === null ? (
                <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : visibili.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nessuna fattura nel periodo scelto.</p>
              ) : visibili.map((d) => (
                <button
                  key={d.fic_id}
                  type="button"
                  onClick={() => apriDocumento(d.fic_id)}
                  className={`flex w-full flex-wrap items-center gap-2 border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted/50 ${d.liberi || d.usatoQui ? '' : 'opacity-50'}`}
                >
                  <span className="font-medium">{d.fornitore_nome}</span>
                  {d.tipo === 'nota_credito' && <Badge variant="outline">NC</Badge>}
                  <span>{d.numero ?? '(senza numero)'} · {formatData(d.data)}</span>
                  <span className="ml-auto">€ {formatEuro(d.imponibile)}</span>
                  {d.usatoQui && <Badge variant="secondary">già usata qui</Badge>}
                  {!d.liberi && <Badge variant="outline">tutta attribuita</Badge>}
                </button>
              ))}
            </div>
          </div>
        )}

        {aperto && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ficIdIniziale === null && (
                <Button size="sm" variant="ghost" onClick={() => { setAperto(null); setScelte({}) }}>
                  <ChevronLeft className="h-4 w-4" /> Altre fatture
                </Button>
              )}
              <strong>{aperto.documento.fornitore_nome}</strong>
              {aperto.documento.tipo === 'nota_credito' && <Badge variant="outline">Nota di credito</Badge>}
              <span>{aperto.documento.numero} · {formatData(aperto.documento.data)}</span>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-2" />
                    <th className="p-2">Articolo</th>
                    <th className="p-2 text-right">In fattura</th>
                    <th className="p-2">Già usata</th>
                    <th className="p-2 text-right">Per questa commessa</th>
                    <th className="p-2 text-right">Prezzo</th>
                    <th className="p-2 text-right">Importo</th>
                    <th className="p-2">Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {aperto.righe.map((r) => {
                    const s = scelte[r.riga_id]
                    const oltre = s && s.quantita > r.rimanente + 0.0005
                    return (
                      <tr key={r.riga_id} className={`border-t ${!r.selezionabile ? 'text-muted-foreground' : ''} ${oltre ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                        <td className="p-2">
                          <Checkbox disabled={!r.selezionabile} checked={!!s} onCheckedChange={(v) => spunta(r, v === true)} />
                        </td>
                        <td className="p-2">
                          <div>{r.descrizione}</div>
                          {r.codice && <div className="text-xs text-muted-foreground">{r.codice}</div>}
                          {oltre && <div className="text-xs text-amber-700">Ne restano {r.rimanente}, ne stai attribuendo {s.quantita}</div>}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{r.quantita} {r.unita ?? ''}</td>
                        <td className="p-2 text-xs">
                          {r.altrove.map((a) => <div key={a.commessa}>{a.quantita} su {a.commessa}</div>)}
                        </td>
                        <td className="p-2 text-right">
                          {s && (
                            <Input
                              className="ml-auto w-24 text-right" inputMode="decimal"
                              value={s.testo ?? String(s.quantita).replace('.', ',')}
                              onChange={(e) => {
                                const n = parseImporto(e.target.value)
                                cambia(r.riga_id, { testo: e.target.value, ...(n !== null ? { quantita: n } : {}) })
                              }}
                              aria-label="Quantità per questa commessa"
                            />
                          )}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">€ {formatEuro(r.prezzo)}</td>
                        <td className="p-2 text-right whitespace-nowrap">{s ? `€ ${formatEuro(importoRiga(s.quantita, r.prezzo, tipo))}` : ''}</td>
                        <td className="p-2">
                          {s && (
                            <Select value={s.categoria ?? ''} onValueChange={(v) => cambia(r.riga_id, { categoria: v as CategoriaCosto })}>
                              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Scegli" /></SelectTrigger>
                              <SelectContent>
                                {CATEGORIE_COSTO.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-sm">Totale attribuito: <strong>€ {formatEuro(totale)}</strong></span>
              {senzaCategoria && <span className="text-sm text-destructive">Scegli la categoria per ogni articolo</span>}
              <Button variant="ghost" onClick={onClose} disabled={pending}>Annulla</Button>
              <Button onClick={salva} disabled={pending || senzaCategoria}>{pending ? 'Salvataggio…' : 'Salva'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
