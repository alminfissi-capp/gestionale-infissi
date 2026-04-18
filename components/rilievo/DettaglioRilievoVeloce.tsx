'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Plus, Pencil, Trash2, GripVertical, Wrench, CheckCircle2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import DialogVoceVeloce from '@/components/rilievo/DialogVoceVeloce'
import AllegatiVoce from '@/components/rilievo/AllegatiVoce'
import ConfiguratoreSerramento from '@/components/winconfig/ConfiguratoreSerramento'
import {
  addVoce,
  updateVoce,
  deleteVoce,
  updateRilievoVeloce,
} from '@/actions/rilievo-veloce'
import { createPreventivo } from '@/actions/preventivi'
import { toast } from 'sonner'
import type { RilievoVeloceCompleto, VoceRilievoVeloce, VoceInput, OpzioniRilievo } from '@/types/rilievo-veloce'
import type { WcSerieCompleta, WcRiempimento, ConfigWinConfig } from '@/types/winconfig'
import type { ClienteSnapshot } from '@/types/preventivo'

interface Props {
  rilievo: RilievoVeloceCompleto
  opzioni: OpzioniRilievo
  serieComplete: WcSerieCompleta[]
  riempimentiOrg: WcRiempimento[]
}

type VoceConfig = { config: ConfigWinConfig; quantita: number; note: string }

function nomeCliente(r: RilievoVeloceCompleto): string {
  const s = r.cliente_snapshot
  if (s.tipo === 'azienda') return s.ragione_sociale || '—'
  return [s.nome, s.cognome].filter(Boolean).join(' ') || '—'
}

function labelVoce(v: VoceRilievoVeloce | VoceInput): string {
  const parti: string[] = []
  if (v.voce) parti.push(v.voce)
  if (v.tipologia) parti.push(v.tipologia)
  if (v.larghezza_mm && v.altezza_mm) parti.push(`${v.larghezza_mm}×${v.altezza_mm} mm`)
  return parti.join(' — ') || 'Serramento'
}

export default function DettaglioRilievoVeloce({ rilievo: rilievoInit, opzioni, serieComplete, riempimentiOrg }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [voci, setVoci] = useState<VoceRilievoVeloce[]>(rilievoInit.voci)
  const [note, setNote] = useState(rilievoInit.note ?? '')
  const [noteSaved, setNoteSaved] = useState(rilievoInit.note ?? '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVoce, setEditingVoce] = useState<VoceRilievoVeloce | null>(null)
  const [configurando, setConfigurando] = useState<VoceRilievoVeloce | null>(null)
  const [configs, setConfigs] = useState<Record<string, VoceConfig>>({})

  const openAdd = () => {
    setEditingVoce(null)
    setDialogOpen(true)
  }

  const openEdit = (v: VoceRilievoVeloce) => {
    setEditingVoce(v)
    setDialogOpen(true)
  }

  const handleSaveVoce = (input: VoceInput) => {
    startTransition(async () => {
      try {
        if (editingVoce) {
          await updateVoce(editingVoce.id, input)
          setVoci((prev) => prev.map((v) => v.id === editingVoce.id ? { ...v, ...input } : v))
          toast.success('Serramento aggiornato')
          setDialogOpen(false)
        } else {
          const nuova = await addVoce(rilievoInit.id, input)
          setVoci((prev) => [...prev, nuova])
          toast.success('Serramento aggiunto — puoi ora allegare foto')
          // rimane aperto in modalità modifica per consentire upload immediato
          setEditingVoce(nuova)
        }
      } catch {
        toast.error('Errore salvataggio')
        setDialogOpen(false)
      }
    })
  }

  const handleDeleteVoce = (v: VoceRilievoVeloce) => {
    if (!confirm('Eliminare questo serramento?')) return
    startTransition(async () => {
      try {
        await deleteVoce(v.id, rilievoInit.id)
        setVoci((prev) => prev.filter((x) => x.id !== v.id))
        toast.success('Serramento eliminato')
      } catch {
        toast.error('Errore eliminazione')
      }
    })
  }

  const handleSalvaConfig = async (config: ConfigWinConfig, quantita: number, noteConf: string) => {
    if (!configurando) return
    setConfigs((prev) => ({ ...prev, [configurando.id]: { config, quantita, note: noteConf } }))
    setConfigurando(null)
    toast.success('Configurazione salvata')
  }

  const handleTrasformaInPreventivo = () => {
    const configured = voci.filter((v) => configs[v.id])
    if (configured.length === 0) {
      toast.error('Configura almeno un serramento prima di creare il preventivo')
      return
    }
    startTransition(async () => {
      try {
        const cs = rilievoInit.cliente_snapshot
        const clienteSnapshot: ClienteSnapshot = {
          tipo: cs.tipo,
          ragione_sociale: cs.ragione_sociale,
          nome: cs.nome,
          cognome: cs.cognome,
          telefono: cs.telefono,
          email: cs.email,
          indirizzo: cs.indirizzo,
          cantiere: cs.cantiere,
          cf_piva: null,
        }
        const articoli = configured.map((voce, i) => {
          const { config, quantita, note: noteArt } = configs[voce.id]
          return {
            tipo: 'winconfig' as const,
            listino_id: null,
            listino_libero_id: null,
            prodotto_id: null,
            accessori_selezionati: null,
            accessori_griglia: null,
            tipologia: labelVoce(voce),
            categoria_nome: 'WinConfig',
            larghezza_mm: config.larghezza_mm,
            altezza_mm: config.altezza_sx_mm,
            larghezza_listino_mm: null,
            altezza_listino_mm: null,
            misura_arrotondata: false,
            finitura_nome: null,
            finitura_aumento: 0,
            finitura_aumento_euro: 0,
            note: noteArt || voce.note || null,
            immagine_url: null,
            quantita,
            prezzo_base: config.prezzo_totale,
            prezzo_unitario: config.prezzo_totale,
            sconto_articolo: 0,
            prezzo_totale_riga: config.prezzo_totale * quantita,
            costo_acquisto_unitario: config.costo_totale,
            costo_posa: 0,
            aliquota_iva: null,
            ordine: i,
            config_winconfig: config,
          }
        })
        const { id } = await createPreventivo({
          clienteId: null,
          clienteSnapshot,
          numero: '',
          articoli,
          scontoGlobale: 0,
          mostraSconto: false,
          note: rilievoInit.note ?? '',
        })
        toast.success('Preventivo creato')
        router.push(`/preventivi/${id}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore creazione preventivo')
      }
    })
  }

  const handleSaveNote = () => {
    startTransition(async () => {
      try {
        await updateRilievoVeloce(rilievoInit.id, { note })
        setNoteSaved(note)
        toast.success('Note salvate')
      } catch {
        toast.error('Errore salvataggio note')
      }
    })
  }

  const s = rilievoInit.cliente_snapshot

  return (
    <>
    {/* Overlay configuratore WinConfig */}
    {configurando && serieComplete.length > 0 && (
      <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-y-auto">
        <div className="flex items-center gap-3 px-4 h-13 border-b bg-white shrink-0 shadow-sm" style={{ height: 52 }}>
          <button
            onClick={() => setConfigurando(null)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-900 text-sm tracking-wide uppercase">
            Configura — {labelVoce(configurando)}
          </span>
        </div>
        <div className="flex-1 p-4">
          <ConfiguratoreSerramento
            serie={serieComplete}
            riempimentiGlobali={riempimentiOrg}
            initialMisure={{
              larghezza: configurando.larghezza_mm ?? 1200,
              altezza_sx: configurando.altezza_sx_mm ?? configurando.altezza_mm ?? 1400,
              altezza_dx: configurando.altezza_dx_mm ?? configurando.altezza_mm ?? 1400,
              quantita: configurando.quantita,
            }}
            onSalva={handleSalvaConfig}
            onAnnulla={() => setConfigurando(null)}
          />
        </div>
      </div>
    )}

    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/rilievo/veloce">
            <ChevronLeft className="h-4 w-4" />
            Rilievo veloce
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{nomeCliente(rilievoInit)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Rilievo del {new Date(rilievoInit.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              {s.cantiere ? ` · Cantiere: ${s.cantiere}` : ''}
            </p>
          </div>
          {serieComplete.length > 0 && (
            <Button
              onClick={handleTrasformaInPreventivo}
              disabled={isPending || Object.keys(configs).length === 0}
              className="shrink-0"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Crea preventivo
              {Object.keys(configs).length > 0 && (
                <span className="ml-1.5 bg-white/20 text-white text-xs rounded-full px-1.5 py-0.5">
                  {Object.keys(configs).length}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Info cliente */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Dati cliente</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {s.tipo === 'azienda' && s.ragione_sociale && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Azienda</dt>
              <dd className="text-gray-800 font-medium">{s.ragione_sociale}</dd>
            </div>
          )}
          {(s.nome || s.cognome) && (
            <div>
              <dt className="text-xs text-gray-500">Nome</dt>
              <dd className="text-gray-800">{[s.nome, s.cognome].filter(Boolean).join(' ')}</dd>
            </div>
          )}
          {s.telefono && (
            <div>
              <dt className="text-xs text-gray-500">Telefono</dt>
              <dd className="text-gray-800">{s.telefono}</dd>
            </div>
          )}
          {s.email && (
            <div>
              <dt className="text-xs text-gray-500">Email</dt>
              <dd className="text-gray-800">{s.email}</dd>
            </div>
          )}
          {s.indirizzo && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Indirizzo</dt>
              <dd className="text-gray-800">{s.indirizzo}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Note */}
      <div className="bg-white rounded-xl border p-5 space-y-2">
        <Label>Note rilievo</Label>
        <textarea
          className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          placeholder="Note generali sul rilievo…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {note !== noteSaved && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveNote} disabled={isPending}>Salva note</Button>
          </div>
        )}
      </div>

      {/* Voci */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Serramenti rilevati {voci.length > 0 && <span className="text-gray-400 font-normal">({voci.length})</span>}
          </h2>
          <Button size="sm" onClick={openAdd} disabled={isPending}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi
          </Button>
        </div>

        {voci.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            Nessun serramento. Clicca <strong>Aggiungi</strong> per inserirne uno.
          </div>
        ) : (
          <div className="space-y-3">
            {voci.map((v) => {
              const hasConfig = !!configs[v.id]
              return (
              <div key={v.id} className={`rounded-lg border ${hasConfig ? 'border-green-200 bg-green-50' : 'bg-gray-50'}`}>
                {/* Riga principale voce */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {hasConfig && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                      <p className="text-sm font-medium text-gray-800 truncate">{labelVoce(v)}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Qt. {v.quantita}
                      {v.serie_profilo ? ` · ${v.serie_profilo}` : ''}
                      {v.colore_interno ? ` · ${v.colore_interno}` : ''}
                      {v.tipologia_vetro ? ` · ${v.tipologia_vetro}` : ''}
                      {v.accessori.length > 0 ? ` · ${v.accessori.join(', ')}` : ''}
                      {v.anta_ribalta ? ' · Anta ribalta' : ''}
                      {v.serratura ? ` · Serratura${v.tipo_serratura ? `: ${v.tipo_serratura}` : ''}` : ''}
                    </p>
                    {hasConfig && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Configurato — Qt. {configs[v.id].quantita} · €{configs[v.id].config.prezzo_totale.toFixed(2)} cad.
                      </p>
                    )}
                    {v.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{v.note}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {serieComplete.length > 0 && (
                      <button
                        onClick={() => setConfigurando(v)}
                        disabled={isPending}
                        className={`p-1.5 rounded-md transition-colors ${hasConfig ? 'text-green-500 hover:text-green-700 hover:bg-green-100' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                        title={hasConfig ? 'Riconfigura in WinConfig' : 'Configura in WinConfig'}
                      >
                        <Wrench className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(v)}
                      disabled={isPending}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                      title="Modifica"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteVoce(v)}
                      disabled={isPending}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {/* Allegati foto/PDF — direttamente sulla pagina, fuori da qualsiasi overflow */}
                <div className={`border-t px-3 pb-3 pt-2 ${hasConfig ? 'border-green-100' : 'border-gray-100'}`}>
                  <AllegatiVoce voceId={v.id} />
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      <DialogVoceVeloce
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveVoce}
        opzioni={opzioni}
        initialValues={editingVoce ?? undefined}
        isEditing={!!editingVoce}
      />
    </div>
    </>
  )
}
