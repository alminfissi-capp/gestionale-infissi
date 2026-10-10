'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cercaCatalogo, getCatalogoFpStato, richiediSincronizzazione } from '@/actions/catalogo-fp'
import { statoPonte } from '@/lib/fppro/ponte-regole'
import type { CatalogoFpStato, RigaCatalogo, SerieFp, TipoCatalogo } from '@/types/fppro'

const dataOra = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' })
const quando = (iso: string | null) => (iso ? dataOra.format(new Date(iso)) : 'mai')

const ETICHETTE_STATO = {
  collegato: { testo: 'Collegato', colore: 'bg-emerald-500' },
  non_raggiungibile: { testo: 'PC spento o non raggiungibile', colore: 'bg-amber-500' },
  mai_collegato: { testo: 'Ponte mai collegato', colore: 'bg-gray-400' },
} as const

const SCHEDE: { valore: TipoCatalogo; etichetta: string }[] = [
  { valore: 'profili', etichetta: 'Profili' },
  { valore: 'accessori', etichetta: 'Accessori' },
  { valore: 'vetri', etichetta: 'Vetri' },
  { valore: 'colori', etichetta: 'Finiture' },
]

interface Props {
  statoIniziale: CatalogoFpStato
  serie: SerieFp[]
}

export default function CatalogoFpClient({ statoIniziale, serie }: Props) {
  const router = useRouter()
  const [stato, setStato] = useState(statoIniziale)
  const [ora, setOra] = useState(() => new Date())
  const [inviando, startInvio] = useTransition()
  const [tipo, setTipo] = useState<TipoCatalogo>('profili')
  const [testo, setTesto] = useState('')
  const [righe, setRighe] = useState<RigaCatalogo[]>([])
  const [cercando, setCercando] = useState(false)

  const richiesta = stato.ultimaRichiesta
  const aperta = richiesta !== null && (richiesta.stato === 'in_attesa' || richiesta.stato === 'in_corso')
  const ponte = ETICHETTE_STATO[statoPonte(stato.ultimoSegnaleAt, ora)]

  // Aggiorna lo stato ogni 5 s mentre una richiesta e' aperta, ogni 30 s altrimenti.
  // L'effetto si ricrea quando `aperta` cambia, quindi qui `aperta` e' sempre
  // quello del giro corrente: niente effetti collaterali dentro setStato.
  useEffect(() => {
    const id = setInterval(async () => {
      const nuovo = await getCatalogoFpStato()
      setOra(new Date())
      setStato(nuovo)
      if (aperta && nuovo.ultimaRichiesta?.stato === 'completata') {
        toast.success('Catalogo sincronizzato con FP PRO')
        router.refresh()
      }
      if (aperta && nuovo.ultimaRichiesta?.stato === 'errore') {
        toast.error(nuovo.ultimaRichiesta.errore ?? 'Sincronizzazione non riuscita')
      }
    }, aperta ? 5000 : 30000)
    return () => clearInterval(id)
  }, [aperta, router])

  // Ricerca con attesa di 300 ms dopo l'ultima lettera.
  useEffect(() => {
    let annullata = false
    const id = setTimeout(async () => {
      setCercando(true)
      try {
        const risultato = await cercaCatalogo(tipo, testo)
        if (!annullata) setRighe(risultato)
      } catch (e) {
        if (!annullata) toast.error(e instanceof Error ? e.message : 'Ricerca non riuscita')
      } finally {
        if (!annullata) setCercando(false)
      }
    }, 300)
    return () => {
      annullata = true
      clearTimeout(id)
    }
  }, [tipo, testo, stato.ultimaSyncAt])

  const sincronizza = () =>
    startInvio(async () => {
      const r = await richiediSincronizzazione()
      if ('errore' in r) {
        toast.error(r.errore)
        return
      }
      setStato(s => ({ ...s, ultimaRichiesta: r.richiesta }))
      toast.info(statoPonte(stato.ultimoSegnaleAt, new Date()) === 'collegato'
        ? 'Sincronizzazione avviata'
        : 'Richiesta in coda: partira\' quando il PC di FP PRO sara\' acceso')
    })

  const c = stato.conteggi

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Catalogo FP PRO</h1>
        <p className="text-sm text-muted-foreground">
          Copia di serie, profili, accessori, vetri e finiture dell&apos;archivio EDILSIDER di FP PRO.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className={`inline-block size-2.5 rounded-full ${ponte.colore}`} />
            Ponte sul PC: {ponte.testo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted-foreground">
            <span>Ultima sincronizzazione: <strong className="text-foreground">{quando(stato.ultimaSyncAt)}</strong></span>
            <span>Ultimo segnale: {quando(stato.ultimoSegnaleAt)}</span>
          </div>
          {richiesta && aperta && (
            <p className="text-sm">
              {richiesta.stato === 'in_corso' ? 'Sincronizzazione in corso…' : 'Sincronizzazione in coda…'}
            </p>
          )}
          {richiesta?.stato === 'errore' && (
            <p className="text-sm text-destructive">Ultimo tentativo non riuscito: {richiesta.errore}</p>
          )}
          <Button onClick={sincronizza} disabled={inviando || aperta} size="sm">
            <RefreshCw className={`size-4 mr-2 ${aperta ? 'animate-spin' : ''}`} />
            {aperta ? 'Sincronizzazione in corso' : 'Sincronizza'}
          </Button>
          <p className="text-xs text-muted-foreground">
            {c.fp_serie} serie · {c.fp_profili} profili · {c.fp_accessori} accessori · {c.fp_vetri} vetri ·{' '}
            {c.fp_colori} finiture · {c.fp_kit} kit
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tipo} onValueChange={v => setTipo(v as TipoCatalogo)}>
          <TabsList>
            {SCHEDE.map(s => <TabsTrigger key={s.valore} value={s.valore}>{s.etichetta}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Input
          className="sm:max-w-xs"
          placeholder="Cerca codice o descrizione"
          value={testo}
          onChange={e => setTesto(e.target.value)}
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {tipo !== 'colori' && <TableHead>Codice</TableHead>}
              <TableHead>Descrizione</TableHead>
              {(tipo === 'profili' || tipo === 'accessori') && <TableHead>Serie</TableHead>}
              <TableHead>Dettagli</TableHead>
              <TableHead className="text-right">Prezzo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {righe.map(r => (
              <TableRow key={r.id}>
                {tipo !== 'colori' && <TableCell className="font-mono text-xs whitespace-nowrap">{r.codice}</TableCell>}
                <TableCell>{r.descrizione}</TableCell>
                {(tipo === 'profili' || tipo === 'accessori') && <TableCell className="whitespace-nowrap">{r.serie}</TableCell>}
                <TableCell className="text-muted-foreground whitespace-nowrap">{r.dettaglio}</TableCell>
                <TableCell className={`text-right whitespace-nowrap ${r.senzaPrezzo ? 'text-amber-600' : ''}`}>
                  {r.prezzo}
                </TableCell>
              </TableRow>
            ))}
            {righe.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {cercando ? 'Ricerca…' : 'Nessun risultato'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Al massimo 50 risultati: scrivi qualcosa per restringere la ricerca. Serie disponibili: {serie.map(s => s.nome).join(', ') || 'nessuna'}.
      </p>
    </div>
  )
}
