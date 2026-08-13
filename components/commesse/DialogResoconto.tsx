'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Loader2, Plus, Trash2, RefreshCw, AlertTriangle, FileDown, Save, Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getDocumentoCommessaUrl } from '@/actions/commesse'
import {
  getResocontoCommessa,
  saveResocontoCommessa,
  getDatiPrecompilazione,
  getIntestazioneAzienda,
} from '@/actions/resoconto-commessa'
import { estraiTestoPdf } from '@/lib/pdfText'
import { parseFattura } from '@/lib/parseFattura'
import { calcolaTotaliResoconto, bozzaNotaScostamento } from '@/lib/resoconto'
import { verificaResoconto } from '@/lib/resoconto-controlli'
import { formatEuro } from '@/lib/pricing'
import type { RigaPreventivo, RigaFattura } from '@/lib/resoconto'
import type { ResocontoCommessaInput } from '@/types/resoconto'
import type { CommessaCompleta, MetodoPagamento } from '@/types/commessa'
import type { Settings } from '@/types/impostazioni'
import type { IncassoResoconto } from './ResocontoPdfDocument'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessa: CommessaCompleta
}

const METODI: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  bonifico: 'Bonifico bancario',
  riba: 'Ri.Ba.',
  altro: 'Altro',
}

const oggi = () => new Date().toISOString().split('T')[0]

const RESOCONTO_VUOTO: ResocontoCommessaInput = {
  data_documento: oggi(),
  cliente_indirizzo: null,
  cliente_piva: null,
  cliente_cf: null,
  cantiere_nome: null,
  cantiere_indirizzo: null,
  righe_preventivi: [],
  righe_fatture: [],
  nota_fatture: null,
  nota_titolo: null,
  nota_testo: null,
  nota_finale: null,
}

/** Sembra una fattura? Serve solo a decidere se avvisare che non si e' letta. */
function sembraFattura(nomeFile: string, tipoDocumento: string): boolean {
  if (tipoDocumento === 'fattura') return true
  const n = nomeFile.toLowerCase()
  return n.includes('fattura') || n.includes('nota di credito')
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

/** Ripulisce numero commessa e cliente per usarli nel nome del file. */
const perNomeFile = (s: string) => s.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')

export default function DialogResoconto({ open, onOpenChange, commessa }: Props) {
  const [form, setForm] = useState<ResocontoCommessaInput>(RESOCONTO_VUOTO)
  const [caricando, setCaricando] = useState(false)
  const [scansione, setScansione] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [allegatiNonLetti, setAllegatiNonLetti] = useState<string[]>([])
  const [destinatari, setDestinatari] = useState<Record<string, string | null>>({})
  const [preventiviCitati, setPreventiviCitati] = useState<
    Record<string, { numero: string; data: string } | null>
  >({})

  const incassi: IncassoResoconto[] = useMemo(
    () =>
      [...commessa.acconti]
        .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento))
        .map((a) => ({
          data: a.data_pagamento,
          riferimento: a.id.slice(-6).toUpperCase(),
          metodo: METODI[a.metodo_pagamento] ?? a.metodo_pagamento,
          importo: a.importo,
        })),
    [commessa.acconti]
  )

  const totali = useMemo(
    () => calcolaTotaliResoconto(form.righe_preventivi, form.righe_fatture, incassi),
    [form.righe_preventivi, form.righe_fatture, incassi]
  )

  const avvisi = useMemo(
    () =>
      verificaResoconto({
        preventivi: form.righe_preventivi,
        fatture: form.righe_fatture,
        incassi,
        aliquoteIva: settings?.aliquote_iva?.length ? settings.aliquote_iva : [10, 22],
        clienteNome: commessa.cliente_nome,
        destinatariPerFattura: destinatari,
        preventiviCitati,
        allegatiNonLetti,
      }),
    [
      form.righe_preventivi, form.righe_fatture, incassi, settings,
      commessa.cliente_nome, destinatari, preventiviCitati, allegatiNonLetti,
    ]
  )

  const fattureConAvviso = useMemo(
    () => new Set(avvisi.map((a) => a.numeroFattura).filter(Boolean) as string[]),
    [avvisi]
  )

  const scostamento = avvisi.find(
    (a) => a.codice === 'preventivato_non_fatturato' || a.codice === 'fatturato_oltre_preventivo'
  )

  /**
   * Scansione degli allegati PDF: ogni documento viene letto e passato al
   * parser. Le fatture gia' presenti nel form non vengono toccate — il lavoro
   * di correzione manuale non si perde mai.
   */
  const scansionaAllegati = useCallback(
    async (giaPresenti: RigaFattura[]): Promise<{
      nuove: RigaFattura[]
      nonLetti: string[]
      destinatari: Record<string, string | null>
      citati: Record<string, { numero: string; data: string } | null>
      primaFattura: ReturnType<typeof parseFattura>
    }> => {
      const nuove: RigaFattura[] = []
      const nonLetti: string[] = []
      const dest: Record<string, string | null> = {}
      const citati: Record<string, { numero: string; data: string } | null> = {}
      let primaFattura: ReturnType<typeof parseFattura> = null

      const numeriNoti = new Set(giaPresenti.map((f) => `${f.tipo}|${f.numero.toUpperCase()}`))
      const pdfs = commessa.documenti.filter((d) => d.nome_file.toLowerCase().endsWith('.pdf'))

      for (const doc of pdfs) {
        let estratta: ReturnType<typeof parseFattura> = null
        try {
          const url = await getDocumentoCommessaUrl(doc.storage_path)
          estratta = parseFattura(await estraiTestoPdf(url))
        } catch {
          // Allegato non scaricabile o illeggibile: si prosegue con gli altri.
          estratta = null
        }

        if (!estratta) {
          if (sembraFattura(doc.nome_file, doc.tipo_documento)) nonLetti.push(doc.nome_file)
          continue
        }

        if (!primaFattura) primaFattura = estratta
        dest[estratta.numero] = estratta.destinatario
        citati[estratta.numero] = estratta.preventivoCitato

        const chiave = `${estratta.tipo}|${estratta.numero.toUpperCase()}`
        if (numeriNoti.has(chiave)) continue
        numeriNoti.add(chiave)

        nuove.push({
          tipo: estratta.tipo,
          numero: estratta.numero,
          data: estratta.data,
          descrizione: estratta.descrizione,
          imponibile: estratta.imponibile,
          iva: estratta.iva,
          totale: estratta.totale,
          daAllegato: true,
        })
      }

      nuove.sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
      return { nuove, nonLetti, destinatari: dest, citati, primaFattura }
    },
    [commessa.documenti]
  )

  // ── Caricamento all'apertura ────────────────────────────────
  useEffect(() => {
    if (!open) return
    let annullato = false

    const carica = async () => {
      setCaricando(true)
      try {
        const [salvato, precompilazione, intestazione] = await Promise.all([
          getResocontoCommessa(commessa.id),
          getDatiPrecompilazione(commessa.id),
          getIntestazioneAzienda(),
        ])
        if (annullato) return

        setSettings(intestazione.settings)
        setLogoUrl(intestazione.logoUrl)

        const base: ResocontoCommessaInput = salvato
          ? {
              data_documento: salvato.data_documento,
              cliente_indirizzo: salvato.cliente_indirizzo,
              cliente_piva: salvato.cliente_piva,
              cliente_cf: salvato.cliente_cf,
              cantiere_nome: salvato.cantiere_nome,
              cantiere_indirizzo: salvato.cantiere_indirizzo,
              righe_preventivi: salvato.righe_preventivi,
              righe_fatture: salvato.righe_fatture,
              nota_fatture: salvato.nota_fatture,
              nota_titolo: salvato.nota_titolo,
              nota_testo: salvato.nota_testo,
              nota_finale: salvato.nota_finale,
            }
          : {
              ...RESOCONTO_VUOTO,
              data_documento: oggi(),
              righe_preventivi: precompilazione.preventivi,
              cliente_indirizzo: precompilazione.clienteIndirizzo,
              cliente_piva: precompilazione.clientePiva,
              cantiere_nome: precompilazione.cantiere,
            }

        setForm(base)
        setCaricando(false)

        // La lettura degli allegati continua in sottofondo: il form e' gia' usabile.
        setScansione(true)
        const esito = await scansionaAllegati(base.righe_fatture)
        if (annullato) return

        setAllegatiNonLetti(esito.nonLetti)
        setDestinatari(esito.destinatari)
        setPreventiviCitati(esito.citati)

        setForm((f) => ({
          ...f,
          righe_fatture: [...f.righe_fatture, ...esito.nuove],
          // I dati fiscali del cliente stanno sulla fattura: si prendono da li'
          // solo se non li abbiamo gia' dal preventivo o da un salvataggio.
          cliente_piva: f.cliente_piva || esito.primaFattura?.destinatarioPiva || null,
          cliente_cf: f.cliente_cf || esito.primaFattura?.destinatarioCf || null,
          cliente_indirizzo:
            f.cliente_indirizzo || esito.primaFattura?.destinatarioIndirizzo || null,
        }))
      } catch {
        if (!annullato) toast.error('Errore nel caricamento del resoconto')
      } finally {
        if (!annullato) {
          setCaricando(false)
          setScansione(false)
        }
      }
    }

    carica()
    return () => { annullato = true }
  }, [open, commessa.id, scansionaAllegati])

  // ── Azioni ─────────────────────────────────────────────────

  const aggiorna = (patch: Partial<ResocontoCommessaInput>) =>
    setForm((f) => ({ ...f, ...patch }))

  const rileggiAllegati = async () => {
    setScansione(true)
    try {
      const esito = await scansionaAllegati(form.righe_fatture)
      setAllegatiNonLetti(esito.nonLetti)
      setDestinatari(esito.destinatari)
      setPreventiviCitati(esito.citati)
      setForm((f) => ({ ...f, righe_fatture: [...f.righe_fatture, ...esito.nuove] }))
      toast.success(
        esito.nuove.length === 0
          ? 'Nessuna fattura nuova negli allegati'
          : esito.nuove.length === 1
            ? '1 fattura aggiunta'
            : `${esito.nuove.length} fatture aggiunte`
      )
    } catch {
      toast.error('Errore nella lettura degli allegati')
    } finally {
      setScansione(false)
    }
  }

  const usaBozzaNota = () => {
    if (!scostamento?.differenza) return
    const aliquota = settings?.aliquote_iva?.length ? Math.max(...settings.aliquote_iva) : 22
    const segno = scostamento.codice === 'preventivato_non_fatturato' ? 1 : -1
    const bozza = bozzaNotaScostamento(segno * scostamento.differenza, aliquota)
    if (!bozza) return
    aggiorna({ nota_titolo: bozza.titolo, nota_testo: bozza.testo })
    toast.success('Bozza inserita nella nota: rileggila prima di stampare')
  }

  const salva = async (): Promise<boolean> => {
    setSalvando(true)
    try {
      await saveResocontoCommessa(commessa.id, form)
      return true
    } catch {
      toast.error('Errore nel salvataggio')
      return false
    } finally {
      setSalvando(false)
    }
  }

  const handleSalva = async () => {
    if (await salva()) toast.success('Resoconto salvato')
  }

  const handleGeneraPdf = async () => {
    setGenerando(true)
    try {
      if (!(await salva())) return

      const [{ pdf }, { default: ResocontoPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ResocontoPdfDocument'),
      ])

      const blob = await pdf(
        <ResocontoPdfDocument
          resoconto={form}
          totali={totali}
          incassi={incassi}
          clienteNome={commessa.cliente_nome}
          numeroCommessa={commessa.numero_commessa}
          settings={settings}
          logoUrl={logoUrl}
        />
      ).toBlob()

      const nomeFile = `Resoconto_Commessa_${perNomeFile(commessa.numero_commessa || 'senza-numero')}_${perNomeFile(commessa.cliente_nome)}.pdf`
      const file = new File([blob], nomeFile, { type: 'application/pdf' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: nomeFile })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nomeFile
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // Condivisione annullata dall'utente: non e' un errore da segnalare.
    } finally {
      setGenerando(false)
    }
  }

  // ── Righe preventivo ────────────────────────────────────────

  const aggiornaPreventivo = (i: number, patch: Partial<RigaPreventivo>) =>
    setForm((f) => ({
      ...f,
      righe_preventivi: f.righe_preventivi.map((r, idx) => {
        if (idx !== i) return r
        const nuova = { ...r, ...patch }
        return { ...nuova, totale: arrotonda(nuova.imponibile + nuova.iva) }
      }),
    }))

  const aggiungiPreventivo = () =>
    setForm((f) => ({
      ...f,
      righe_preventivi: [
        ...f.righe_preventivi,
        { numero: '', data: null, oggetto: '', imponibile: 0, iva: 0, totale: 0 },
      ],
    }))

  const eliminaPreventivo = (i: number) =>
    setForm((f) => ({ ...f, righe_preventivi: f.righe_preventivi.filter((_, idx) => idx !== i) }))

  // ── Righe fattura ───────────────────────────────────────────

  const aggiornaFattura = (i: number, patch: Partial<RigaFattura>) =>
    setForm((f) => ({
      ...f,
      righe_fatture: f.righe_fatture.map((r, idx) => {
        if (idx !== i) return r
        const nuova = { ...r, ...patch }
        return { ...nuova, totale: arrotonda(nuova.imponibile + nuova.iva) }
      }),
    }))

  const aggiungiFattura = (tipo: RigaFattura['tipo']) =>
    setForm((f) => ({
      ...f,
      righe_fatture: [
        ...f.righe_fatture,
        { tipo, numero: '', data: null, descrizione: '', imponibile: 0, iva: 0, totale: 0, daAllegato: false },
      ],
    }))

  const eliminaFattura = (i: number) =>
    setForm((f) => ({ ...f, righe_fatture: f.righe_fatture.filter((_, idx) => idx !== i) }))

  // ── Render ──────────────────────────────────────────────────

  const campo = (
    label: string,
    valore: string | null,
    onChange: (v: string | null) => void,
    placeholder?: string
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{label}</Label>
      <Input
        value={valore ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Resoconto economico — {commessa.cliente_nome}</DialogTitle>
        </DialogHeader>

        {caricando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* ── Avvisi ── */}
            {avvisi.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  {avvisi.length === 1 ? 'Un controllo non torna' : `${avvisi.length} controlli non tornano`}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {avvisi.map((a, i) => (
                    <li key={`${a.codice}-${i}`} className="leading-relaxed">• {a.messaggio}</li>
                  ))}
                </ul>
              </div>
            )}

            {scansione && (
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lettura degli allegati…
              </p>
            )}

            {/* ── Documento, cliente, cantiere ── */}
            <section className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-1">
                {campo('Data documento', form.data_documento, (v) =>
                  aggiorna({ data_documento: v ?? oggi() }))}
              </div>
              <div className="sm:col-span-3">
                {campo('Indirizzo cliente', form.cliente_indirizzo, (v) =>
                  aggiorna({ cliente_indirizzo: v }), 'Via, CAP, città (PR)')}
              </div>
              <div className="sm:col-span-1">
                {campo('P.IVA cliente', form.cliente_piva, (v) => aggiorna({ cliente_piva: v }))}
              </div>
              <div className="sm:col-span-1">
                {campo('C.F. cliente', form.cliente_cf, (v) => aggiorna({ cliente_cf: v }))}
              </div>
              <div className="sm:col-span-2">
                {campo('Cantiere', form.cantiere_nome, (v) =>
                  aggiorna({ cantiere_nome: v }), 'Frantoio')}
              </div>
              <div className="sm:col-span-4">
                {campo('Indirizzo cantiere', form.cantiere_indirizzo, (v) =>
                  aggiorna({ cantiere_indirizzo: v }), 'C.da San Giovanni – Mazara del Vallo (TP)')}
              </div>
            </section>

            {/* ── Preventivi ── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Preventivi accettati
                </p>
                <Button variant="ghost" size="sm" onClick={aggiungiPreventivo}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Aggiungi
                </Button>
              </div>

              {form.righe_preventivi.length === 0 ? (
                <p className="text-sm text-gray-400">Nessun preventivo.</p>
              ) : (
                <div className="space-y-1.5">
                  {form.righe_preventivi.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                      <Input
                        className="col-span-2 h-8 text-xs"
                        placeholder="Numero"
                        value={p.numero}
                        onChange={(e) => aggiornaPreventivo(i, { numero: e.target.value })}
                      />
                      <Input
                        type="date"
                        className="col-span-2 h-8 text-xs"
                        value={p.data ?? ''}
                        onChange={(e) => aggiornaPreventivo(i, { data: e.target.value || null })}
                      />
                      <Input
                        className="col-span-4 h-8 text-xs"
                        placeholder="Oggetto"
                        value={p.oggetto}
                        onChange={(e) => aggiornaPreventivo(i, { oggetto: e.target.value })}
                      />
                      <Input
                        type="number" step="0.01"
                        className="col-span-1 h-8 text-xs text-right"
                        placeholder="Imp."
                        value={p.imponibile || ''}
                        onChange={(e) => aggiornaPreventivo(i, { imponibile: Number(e.target.value) || 0 })}
                      />
                      <Input
                        type="number" step="0.01"
                        className="col-span-1 h-8 text-xs text-right"
                        placeholder="IVA"
                        value={p.iva || ''}
                        onChange={(e) => aggiornaPreventivo(i, { iva: Number(e.target.value) || 0 })}
                      />
                      <span className="col-span-1 text-xs text-right font-medium text-gray-700">
                        {formatEuro(p.totale)}
                      </span>
                      <Button
                        variant="ghost" size="icon"
                        className="col-span-1 h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={() => eliminaPreventivo(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-end gap-4 pt-1.5 border-t text-xs font-semibold">
                    <span className="text-gray-500">Totale preventivato</span>
                    <span>{formatEuro(totali.preventivatoTotale)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* ── Fatture ── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Fatture emesse
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={rileggiAllegati} disabled={scansione}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${scansione ? 'animate-spin' : ''}`} />
                    Rileggi allegati
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => aggiungiFattura('fattura')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Fattura
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => aggiungiFattura('nota_credito')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Nota credito
                  </Button>
                </div>
              </div>

              {form.righe_fatture.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nessuna fattura. Allega i PDF alla commessa e premi “Rileggi allegati”.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {form.righe_fatture.map((f, i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-12 gap-1.5 items-center rounded px-1 py-0.5 ${
                        fattureConAvviso.has(f.numero) ? 'bg-amber-50' : ''
                      }`}
                    >
                      <div className="col-span-2 flex items-center gap-1">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Numero"
                          value={f.numero}
                          onChange={(e) => aggiornaFattura(i, { numero: e.target.value })}
                        />
                        {f.daAllegato && (
                          <span
                            className="shrink-0 h-1.5 w-1.5 rounded-full bg-teal-500"
                            title="Letta da un allegato"
                          />
                        )}
                      </div>
                      <Input
                        type="date"
                        className="col-span-2 h-8 text-xs"
                        value={f.data ?? ''}
                        onChange={(e) => aggiornaFattura(i, { data: e.target.value || null })}
                      />
                      <Input
                        className="col-span-4 h-8 text-xs"
                        placeholder={f.tipo === 'nota_credito' ? 'Nota di credito' : 'Descrizione'}
                        value={f.descrizione}
                        onChange={(e) => aggiornaFattura(i, { descrizione: e.target.value })}
                      />
                      <Input
                        type="number" step="0.01"
                        className="col-span-1 h-8 text-xs text-right"
                        placeholder="Imp."
                        value={f.imponibile || ''}
                        onChange={(e) => aggiornaFattura(i, { imponibile: Number(e.target.value) || 0 })}
                      />
                      <Input
                        type="number" step="0.01"
                        className="col-span-1 h-8 text-xs text-right"
                        placeholder="IVA"
                        value={f.iva || ''}
                        onChange={(e) => aggiornaFattura(i, { iva: Number(e.target.value) || 0 })}
                      />
                      <span className="col-span-1 text-xs text-right font-medium text-gray-700">
                        {formatEuro(f.totale)}
                      </span>
                      <Button
                        variant="ghost" size="icon"
                        className="col-span-1 h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={() => eliminaFattura(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-end gap-4 pt-1.5 border-t text-xs font-semibold">
                    <span className="text-gray-500">Totale fatturato</span>
                    <span>{formatEuro(totali.fatturatoTotale)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <Label className="text-xs text-gray-500">Nota sotto la tabella fatture</Label>
                <Textarea
                  rows={2}
                  className="text-sm"
                  placeholder="Es. La fattura a saldo espone già in detrazione gli acconti…"
                  value={form.nota_fatture ?? ''}
                  onChange={(e) => aggiorna({ nota_fatture: e.target.value || null })}
                />
              </div>
            </section>

            {/* ── Incassi ── */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Incassi ricevuti
              </p>
              {incassi.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nessun acconto registrato sulla commessa.
                </p>
              ) : (
                <div className="rounded-md border divide-y">
                  {incassi.map((inc) => (
                    <div key={inc.riferimento} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                      <span className="w-20 text-gray-500">
                        {inc.data.split('-').reverse().join('/')}
                      </span>
                      <span className="w-24 font-mono">{inc.riferimento}</span>
                      <span className="flex-1 text-gray-500">{inc.metodo}</span>
                      <span className="font-medium">{formatEuro(inc.importo)}</span>
                    </div>
                  ))}
                  <div className="flex justify-end gap-4 px-3 py-1.5 text-xs font-semibold">
                    <span className="text-gray-500">Totale incassato</span>
                    <span>{formatEuro(totali.incassato)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* ── Situazione contabile ── */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Situazione contabile
              </p>
              <div className="rounded-md border bg-gray-50 divide-y text-sm">
                <div className="flex justify-between px-3 py-1.5">
                  <span className="text-gray-600">Totale fatturato (IVA inclusa)</span>
                  <span>{formatEuro(totali.fatturatoTotale)}</span>
                </div>
                <div className="flex justify-between px-3 py-1.5">
                  <span className="text-gray-600">Totale incassato</span>
                  <span>– {formatEuro(totali.incassato)}</span>
                </div>
                <div className="flex justify-between px-3 py-1.5 font-semibold">
                  <span>Saldo residuo su fatture emesse</span>
                  <span>{formatEuro(totali.saldoResiduoFatture)}</span>
                </div>
                {form.righe_preventivi.length > 0 && totali.preventivatoNonFatturato !== 0 && (
                  <div className="flex justify-between px-3 py-1.5">
                    <span className="text-gray-600">Preventivato non ancora fatturato</span>
                    <span>
                      {totali.preventivatoNonFatturato > 0 ? '+ ' : '– '}
                      {formatEuro(Math.abs(totali.preventivatoNonFatturato))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2 font-bold text-teal-700">
                  <span>Totale a saldo della commessa</span>
                  <span>{formatEuro(totali.totaleASaldo)}</span>
                </div>
              </div>
            </section>

            {/* ── Note ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  Nota in evidenza
                </p>
                {scostamento && (
                  <Button variant="outline" size="sm" onClick={usaBozzaNota}>
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    Usa come nota
                  </Button>
                )}
              </div>
              <Input
                className="h-8 text-sm"
                placeholder="Titolo della nota"
                value={form.nota_titolo ?? ''}
                onChange={(e) => aggiorna({ nota_titolo: e.target.value || null })}
              />
              <Textarea
                rows={4}
                className="text-sm"
                placeholder="Testo della nota"
                value={form.nota_testo ?? ''}
                onChange={(e) => aggiorna({ nota_testo: e.target.value || null })}
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Note finali (corpo piccolo, sopra le firme)</Label>
                <Textarea
                  rows={2}
                  className="text-sm"
                  value={form.nota_finale ?? ''}
                  onChange={(e) => aggiorna({ nota_finale: e.target.value || null })}
                />
              </div>
            </section>
          </div>
        )}

        {/* ── Barra azioni ── */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button variant="outline" size="sm" onClick={handleSalva} disabled={salvando || caricando}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {salvando ? 'Salvataggio…' : 'Salva'}
          </Button>
          <Button size="sm" onClick={handleGeneraPdf} disabled={generando || caricando}>
            {generando
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
            Genera PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
