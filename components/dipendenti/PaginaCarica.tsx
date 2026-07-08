'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addBustaPaga, addPagamento, esisteBusta } from '@/actions/dipendenti'
import { estraiTestoPagine } from '@/lib/pdf-testo'
import { matchBeneficiario, matchDipendente, MENSILITA_LABELS } from '@/lib/dipendenti'
import type {
  BonificoEstratto,
  BustaEstratta,
  Dipendente,
  Mensilita,
} from '@/types/dipendente'
import DialogDipendente from './DialogDipendente'

type TipoDoc = 'busta' | 'bonifico'

interface PropostaBusta {
  uid: string
  file: File
  dipendenteId: string | null
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  netto: string
  lordo: string
  pagina: number | null
  raw: BustaEstratta | null
}

interface PropostaBonifico {
  uid: string
  file: File
  dipendenteId: string | null
  dataPagamento: string // 'YYYY-MM-DD'
  importo: string
  periodo: string // 'YYYY-MM'
  mensilita: Mensilita
  causale: string
  raw: BonificoEstratto | null
}

const meseCorrente = () => new Date().toISOString().slice(0, 7)
const oggi = () => new Date().toISOString().slice(0, 10)

export default function PaginaCarica({ dipendenti: iniziali }: { dipendenti: Dipendente[] }) {
  const router = useRouter()
  const [dipendenti, setDipendenti] = useState(iniziali)
  const [tipo, setTipo] = useState<TipoDoc>('busta')
  const [buste, setBuste] = useState<PropostaBusta[]>([])
  const [bonifici, setBonifici] = useState<PropostaBonifico[]>([])
  const [estraendo, setEstraendo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nuovoDipOpen, setNuovoDipOpen] = useState(false)
  const assegnaANuovo = useRef<((id: string) => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setEstraendo(true)
    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          toast.error(`${file.name}: solo file PDF`)
          continue
        }
        let pagine: string[] = []
        let leggibile = true
        try {
          pagine = await estraiTestoPagine(file)
        } catch {
          leggibile = false
          toast.error(`${file.name}: PDF non leggibile`)
        }
        let estratto: unknown = null
        if (pagine.some((p) => p)) {
          try {
            const res = await fetch('/api/estrai-documenti', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo, pagine }),
            })
            if (res.ok) estratto = await res.json()
            else toast.warning(`${file.name}: estrazione automatica fallita, compila i campi a mano`)
          } catch {
            estratto = null
            toast.warning(`${file.name}: estrazione automatica fallita, compila i campi a mano`)
          }
        } else if (leggibile) {
          toast.warning(`${file.name}: nessun testo nel PDF (scansione?), compila i campi a mano`)
        }

        if (tipo === 'busta') {
          const trovate = (estratto as { buste?: BustaEstratta[] } | null)?.buste ?? []
          const proposte: PropostaBusta[] =
            trovate.length > 0
              ? trovate.map((b) => ({
                  uid: crypto.randomUUID(),
                  file,
                  dipendenteId: matchDipendente(dipendenti, b)?.id ?? null,
                  periodo: b.periodo || meseCorrente(),
                  mensilita: b.mensilita,
                  netto: b.netto ? String(b.netto) : '',
                  lordo: b.lordo ? String(b.lordo) : '',
                  pagina: b.pagina,
                  raw: b,
                }))
              : [{
                  uid: crypto.randomUUID(),
                  file,
                  dipendenteId: null,
                  periodo: meseCorrente(),
                  mensilita: 'mensile',
                  netto: '',
                  lordo: '',
                  pagina: null,
                  raw: null,
                }]
          setBuste((prev) => [...prev, ...proposte])
        } else {
          const b = estratto as BonificoEstratto | null
          setBonifici((prev) => [
            ...prev,
            {
              uid: crypto.randomUUID(),
              file,
              dipendenteId: b ? matchBeneficiario(dipendenti, b)?.id ?? null : null,
              dataPagamento: b?.data_pagamento ?? oggi(),
              importo: b?.importo ? String(b.importo) : '',
              periodo: b?.periodo_competenza ?? meseCorrente(),
              mensilita: b?.mensilita ?? 'mensile',
              causale: b?.causale ?? '',
              raw: b,
            },
          ])
        }
      }
    } finally {
      setEstraendo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const apriNuovoDipendente = (assegna: (id: string) => void) => {
    assegnaANuovo.current = assegna
    setNuovoDipOpen(true)
  }

  const onDipendenteCreato = (d: Dipendente) => {
    setDipendenti((prev) => [...prev, d])
    assegnaANuovo.current?.(d.id)
    assegnaANuovo.current = null
  }

  const conferma = async () => {
    for (const [i, p] of buste.entries()) {
      if (!p.dipendenteId) { toast.error(`Busta ${i + 1}: seleziona il dipendente`); return }
      if (!parseFloat(p.netto.replace(',', '.'))) { toast.error(`Busta ${i + 1}: netto mancante`); return }
      if (!p.periodo) { toast.error(`Busta ${i + 1}: mese di competenza mancante`); return }
    }
    for (const [i, p] of bonifici.entries()) {
      if (!p.dipendenteId) { toast.error(`Bonifico ${i + 1}: seleziona il dipendente`); return }
      if (!parseFloat(p.importo.replace(',', '.'))) { toast.error(`Bonifico ${i + 1}: importo mancante`); return }
      if (!p.periodo) { toast.error(`Bonifico ${i + 1}: mese di competenza mancante`); return }
      if (!p.dataPagamento) { toast.error(`Bonifico ${i + 1}: data pagamento mancante`); return }
    }
    setSalvando(true)
    try {
      for (const p of buste) {
        const periodo = `${p.periodo}-01`
        const duplicata = await esisteBusta(p.dipendenteId!, periodo, p.mensilita)
        if (duplicata) {
          const dip = dipendenti.find((d) => d.id === p.dipendenteId)
          const ok = window.confirm(
            `Esiste già una busta ${MENSILITA_LABELS[p.mensilita].toLowerCase()} di ${dip?.cognome ?? ''} per questo mese. Aggiungere comunque?`,
          )
          if (!ok) continue
        }
        const fd = new FormData()
        fd.set('file', p.file)
        await addBustaPaga(
          {
            dipendente_id: p.dipendenteId!,
            periodo,
            mensilita: p.mensilita,
            netto: parseFloat(p.netto.replace(',', '.')),
            lordo: p.lordo ? parseFloat(p.lordo.replace(',', '.')) : null,
            pagina: p.pagina,
            dati_estratti: p.raw ? { ...p.raw } : null,
          },
          fd,
        )
      }
      for (const p of bonifici) {
        const fd = new FormData()
        fd.set('file', p.file)
        await addPagamento(
          {
            dipendente_id: p.dipendenteId!,
            data_pagamento: p.dataPagamento,
            importo: parseFloat(p.importo.replace(',', '.')),
            metodo: 'bonifico',
            periodo_competenza: `${p.periodo}-01`,
            mensilita: p.mensilita,
            note: p.causale || null,
            dati_estratti: p.raw ? { ...p.raw } : null,
          },
          fd,
        )
      }
      toast.success('Documenti registrati')
      router.push('/dipendenti')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSalvando(false)
    }
  }

  const totaleProposte = buste.length + bonifici.length

  const selettoreDipendente = (
    valore: string | null,
    assegna: (id: string) => void,
  ) => (
    <Select
      value={valore ?? ''}
      onValueChange={(v) => (v === '__nuovo__' ? apriNuovoDipendente(assegna) : assegna(v))}
    >
      <SelectTrigger className={valore ? '' : 'border-red-400'}>
        <SelectValue placeholder="Seleziona dipendente *" />
      </SelectTrigger>
      <SelectContent>
        {dipendenti.map((d) => (
          <SelectItem key={d.id} value={d.id}>{d.cognome} {d.nome}</SelectItem>
        ))}
        <SelectItem value="__nuovo__">+ Nuovo dipendente...</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Carica documenti</h1>
      </div>

      {/* Selettore tipo + upload */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="space-y-1">
          <Label>Tipo di documento</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDoc)}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="busta">Buste paga (anche PDF con più dipendenti)</SelectItem>
              <SelectItem value="bonifico">Contabili bonifico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <input
            ref={fileInputRef}
            id="upload-doc"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button asChild variant="outline" disabled={estraendo}>
            <label
              htmlFor="upload-doc"
              className={estraendo ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            >
              {estraendo ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lettura in corso...</>
              ) : (
                <><FileUp className="h-4 w-4 mr-2" /> Scegli PDF dal dispositivo</>
              )}
            </label>
          </Button>
        </div>
      </div>

      {/* Revisione buste */}
      {buste.map((p) => (
        <div key={p.uid} className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Busta paga · {p.file.name}{p.pagina ? ` · pag. ${p.pagina}` : ''}
              {p.raw && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">letta automaticamente — verifica i dati</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setBuste((prev) => prev.filter((x) => x.uid !== p.uid))}>
              Rimuovi
            </Button>
          </div>
          {p.raw && (
            <p className="text-xs text-gray-500">
              Letto: {p.raw.nome} {p.raw.cognome}{p.raw.codice_fiscale ? ` · ${p.raw.codice_fiscale}` : ''}
            </p>
          )}
          {selettoreDipendente(p.dipendenteId, (id) =>
            setBuste((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, dipendenteId: id } : x))),
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Mese</Label>
              <Input type="month" value={p.periodo}
                onChange={(e) => setBuste((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, periodo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={p.mensilita}
                onValueChange={(v) => setBuste((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, mensilita: v as Mensilita } : x)))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Netto (€) *</Label>
              <Input inputMode="decimal" value={p.netto}
                onChange={(e) => setBuste((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, netto: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Lordo (€)</Label>
              <Input inputMode="decimal" value={p.lordo}
                onChange={(e) => setBuste((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, lordo: e.target.value } : x)))} />
            </div>
          </div>
        </div>
      ))}

      {/* Revisione bonifici */}
      {bonifici.map((p) => (
        <div key={p.uid} className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Bonifico · {p.file.name}
              {p.raw && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">letto automaticamente — verifica i dati</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setBonifici((prev) => prev.filter((x) => x.uid !== p.uid))}>
              Rimuovi
            </Button>
          </div>
          {p.raw?.beneficiario && (
            <p className="text-xs text-gray-500">Beneficiario letto: {p.raw.beneficiario}</p>
          )}
          {selettoreDipendente(p.dipendenteId, (id) =>
            setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, dipendenteId: id } : x))),
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Importo (€) *</Label>
              <Input inputMode="decimal" value={p.importo}
                onChange={(e) => setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, importo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={p.dataPagamento}
                onChange={(e) => setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, dataPagamento: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mese di competenza</Label>
              <Input type="month" value={p.periodo}
                onChange={(e) => setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, periodo: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={p.mensilita}
                onValueChange={(v) => setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, mensilita: v as Mensilita } : x)))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Causale / note</Label>
            <Input value={p.causale}
              onChange={(e) => setBonifici((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, causale: e.target.value } : x)))} />
          </div>
        </div>
      ))}

      {totaleProposte > 0 && (
        <Button onClick={conferma} disabled={salvando || estraendo} className="w-full">
          {salvando
            ? 'Salvataggio...'
            : `Conferma e registra ${totaleProposte} document${totaleProposte === 1 ? 'o' : 'i'}`}
        </Button>
      )}

      <DialogDipendente
        open={nuovoDipOpen}
        onOpenChange={setNuovoDipOpen}
        dipendente={null}
        onSaved={onDipendenteCreato}
      />
    </div>
  )
}
