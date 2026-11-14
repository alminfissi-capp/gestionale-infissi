'use client'

// Nomi brevi da cantiere (spec 2026-11-14-kit-come-fppro): per ogni gruppo di FP PRO i kit con il
// nome automatico; scrivendo un nome lo si corregge per tutte le strutture, vuoto = automatico.
// I telefoni lo ricevono al prossimo aggiornamento del catalogo.
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { getNomiBreviFp, salvaNomeBreveFp } from '@/actions/catalogo-fp'
import type { GruppoNomiBrevi } from '@/lib/fppro/nomi-brevi'

export default function NomiBreviFp() {
  const [gruppi, setGruppi] = useState<GruppoNomiBrevi[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [cerca, setCerca] = useState('')
  const [bozze, setBozze] = useState<Record<string, string>>({})

  useEffect(() => {
    let attivo = true
    getNomiBreviFp().then(r => {
      if (!attivo) return
      if ('errore' in r) setErrore(r.errore)
      else setGruppi(r.gruppi)
    })
    return () => { attivo = false }
  }, [])

  const visibili = useMemo(() => {
    const t = cerca.trim().toLowerCase()
    if (!gruppi || !t) return gruppi ?? []
    return gruppi
      .map(g => ({ ...g, kit: g.kit.filter(k => `${g.titolo} ${k.codice} ${k.descrizione} ${k.automatico} ${k.corretto ?? ''}`.toLowerCase().includes(t)) }))
      .filter(g => g.kit.length > 0)
  }, [gruppi, cerca])

  const salva = async (chiave: string, valore: string, prima: string | null) => {
    if ((valore.trim() || null) === prima) return
    const r = await salvaNomeBreveFp(chiave, valore)
    if ('errore' in r) {
      toast.error(r.errore)
      return
    }
    setGruppi(g => g?.map(x => ({ ...x, kit: x.kit.map(k => (k.chiave === chiave ? { ...k, corretto: valore.trim() || null } : k)) })) ?? null)
    toast.success(valore.trim() ? 'Nome breve salvato' : 'Tornato il nome automatico')
  }

  if (errore) return <p className="text-sm text-destructive">{errore}</p>
  if (!gruppi) return <p className="text-sm text-muted-foreground">Caricamento…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sono le risposte che vedi nella voce del rilievo. Scrivi un nome per cambiarlo in tutte le strutture; lascia vuoto per usare quello automatico.
      </p>
      <Input className="sm:max-w-xs" placeholder="Cerca kit o gruppo" value={cerca} onChange={e => setCerca(e.target.value)} />
      {visibili.map(g => (
        <div key={`${g.ordine}-${g.titolo}`} className="rounded-md border">
          <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{g.titolo}</p>
          <div className="divide-y">
            {g.kit.map(k => (
              <div key={k.chiave} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 sm:w-1/2">
                  <p className="truncate font-mono text-xs">{k.codice}</p>
                  {k.descrizione && <p className="truncate text-xs text-muted-foreground">{k.descrizione}</p>}
                </div>
                <Input
                  className="sm:w-1/2"
                  placeholder={k.automatico}
                  value={bozze[k.chiave] ?? k.corretto ?? ''}
                  onChange={e => setBozze(b => ({ ...b, [k.chiave]: e.target.value }))}
                  onBlur={e => salva(k.chiave, e.target.value, k.corretto)}
                  aria-label={`Nome breve di ${k.codice}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {visibili.length === 0 && <p className="text-sm text-muted-foreground">Nessun kit trovato.</p>}
    </div>
  )
}
