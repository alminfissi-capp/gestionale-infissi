'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Copy, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getPannelloPagamento, salvaImpostazioniPagamento, type PannelloPagamento } from '@/actions/pagamenti'
import { ETICHETTE_STATO, euro, testoWhatsappPagamento } from '@/lib/pagamenti/formato'
import { MESSAGGI_BLOCCO } from '@/lib/pagamenti/regole'
import { nomeMetodo } from '@/lib/pagamenti/metodo'
import type { ImpostazioniPreventivo } from '@/lib/pagamenti/tipi'

interface Props {
  preventivoId: string
  /** Link pubblico del preventivo (/p/{share_token}); null se non ancora condiviso */
  link: string | null
  clienteAzienda: boolean
  /** Frase da aggiungere al messaggio WhatsApp (vuota se il pagamento non e' attivo) */
  onTestoWhatsapp: (testo: string) => void
}

const PERCENTUALI = [20, 30, 40, 50]

/** Pannello "Pagamento online" del preventivo: l'operatore decide preventivo per preventivo. */
export default function PannelloPagamentoOnline({ preventivoId, link, clienteAzienda, onTestoWhatsapp }: Props) {
  const [dati, setDati] = useState<PannelloPagamento | null>(null)
  const [inCorso, avvia] = useTransition()

  const aggiorna = useCallback(async () => {
    const d = await getPannelloPagamento(preventivoId)
    setDati(d)
    onTestoWhatsapp(link ? testoWhatsappPagamento(d.anteprima, link) : '')
  }, [preventivoId, link, onTestoWhatsapp])

  useEffect(() => { avvia(aggiorna) }, [aggiorna])

  const salva = (patch: Partial<ImpostazioniPreventivo>) => {
    if (!dati) return
    const { preventivo_id: _id, ...attuali } = dati.impostazioni
    avvia(async () => {
      const r = await salvaImpostazioniPagamento(preventivoId, { ...attuali, ...patch })
      if (r.errore) { toast.error(r.errore); return }
      await aggiorna()
    })
  }

  if (!dati) return <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Caricamento…</p>
  const imp = dati.impostazioni
  const a = dati.anteprima
  const visibili = dati.pagamenti.filter(x => x.stato !== 'creato' && x.stato !== 'annullato')
  const percentualeLibera = imp.modalita === 'percentuale' && imp.acconto_percentuale && !PERCENTUALI.includes(imp.acconto_percentuale)
    ? imp.acconto_percentuale : ''

  return (
    <div className="space-y-3 text-sm">
      {!dati.stripeCollegato && (
        <p className="text-amber-700">
          Stripe non è collegato: <Link href="/impostazioni" className="underline">Impostazioni → Collegamenti</Link>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Switch id="pag-attivo" checked={imp.abilitato} onCheckedChange={v => salva({ abilitato: v })} disabled={inCorso} />
        <label htmlFor="pag-attivo" className="font-medium">Pagamento online {imp.abilitato ? 'attivo' : 'spento'}</label>
        {dati.modalita === 'prova' && <Badge variant="secondary">Modalità prova</Badge>}
        {inCorso && <Loader2 className="size-4 animate-spin text-gray-400" />}
      </div>

      {imp.abilitato && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-500 w-24">Si chiede</span>
            {PERCENTUALI.map(p => (
              <Button key={p} type="button" size="sm" disabled={inCorso}
                variant={imp.modalita === 'percentuale' && imp.acconto_percentuale === p ? 'default' : 'outline'}
                onClick={() => salva({ modalita: 'percentuale', acconto_percentuale: p })}>{p}%</Button>
            ))}
            <Input key={String(percentualeLibera)} type="number" min={1} max={99} className="w-20 h-8" placeholder="%" disabled={inCorso}
              defaultValue={percentualeLibera}
              onBlur={e => { const v = Number(e.target.value); if (v > 0 && v < 100 && v !== imp.acconto_percentuale) salva({ modalita: 'percentuale', acconto_percentuale: v }) }} />
            <Button type="button" size="sm" disabled={inCorso} variant={imp.modalita === 'totale' ? 'default' : 'outline'}
              onClick={() => salva({ modalita: 'totale' })}>Totale</Button>
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={imp.rate_abilitate && !clienteAzienda} disabled={inCorso || clienteAzienda} onCheckedChange={v => salva({ rate_abilitate: v })} />
            Pagamento a rate {clienteAzienda && <span className="text-gray-400">(non disponibile per le aziende)</span>}
          </label>
          {imp.modalita === 'percentuale' && (
            <label className="flex items-center gap-2">
              <Switch checked={imp.saldo_online} disabled={inCorso} onCheckedChange={v => salva({ saldo_online: v })} />
              Dopo l&apos;acconto, il cliente può pagare online anche il saldo
            </label>
          )}
          <label className="flex items-center gap-2">
            <Switch checked={imp.con_detrazione_fiscale} disabled={inCorso} onCheckedChange={v => salva({ con_detrazione_fiscale: v })} />
            Lavoro con detrazione fiscale <span className="text-gray-400">(blocca il pagamento online: serve il bonifico parlante)</span>
          </label>
          <p className="font-medium">
            {a.pagabile ? `Il cliente pagherà: ${a.opzioni.map(o => `${o.etichetta} ${euro(o.importo)}`).join(', ')}` : MESSAGGI_BLOCCO[a.motivo]}
          </p>
          {link ? (
            <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiato') }}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copia link di pagamento
            </Button>
          ) : (
            <p className="text-gray-400">Condividi il preventivo per avere il link da mandare al cliente.</p>
          )}
        </div>
      )}

      {visibili.length > 0 && (
        <ul className="space-y-1">
          {visibili.map(x => (
            <li key={x.id} className="flex flex-wrap gap-2">
              <span className={x.stato === 'pagato' ? 'text-green-700 font-medium' : 'text-gray-500'}>{ETICHETTE_STATO[x.stato] ?? x.stato}</span>
              <span>{euro(x.importo)} · {x.tipo} · {nomeMetodo(x.metodo)}</span>
              {x.pagato_at && <span className="text-gray-400">{new Date(x.pagato_at).toLocaleDateString('it-IT')}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
