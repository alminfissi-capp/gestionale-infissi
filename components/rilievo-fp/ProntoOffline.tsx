'use client'

// Riquadro sempre visibile: dice se il telefono e' pronto per il rilievo senza rete e,
// se non lo e', lo prepara con un tocco (aggiorna l'app, salva la pagina, scarica il catalogo).
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PAGINA_CANTIERE = '/rilievo/cantiere'
export const CACHE_CANTIERE = 'pagina-cantiere'

interface Controlli {
  /** C'e' una versione nuova dell'app in attesa di essere attivata */
  aggiornamentoInAttesa: boolean
  /** La pagina del rilievo e' salvata nel telefono */
  paginaSalvata: boolean
}

/** Il service worker attivo sa servire il cantiere senza rete? Uno vecchio non risponde. */
function workerAggiornato(): Promise<boolean> {
  const controller = navigator.serviceWorker?.controller
  if (!controller) return Promise.resolve(false)
  return new Promise(resolve => {
    const canale = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 1500)
    canale.port1.onmessage = () => { clearTimeout(timer); resolve(true) }
    controller.postMessage({ type: 'SUPPORTA_CANTIERE' }, [canale.port2])
  })
}

async function controlla(): Promise<Controlli> {
  const reg = await navigator.serviceWorker?.getRegistration()
  const cache = await caches.open(CACHE_CANTIERE)
  return {
    aggiornamentoInAttesa: !!reg?.waiting || !!reg?.installing || !(await workerAggiornato()),
    paginaSalvata: !!(await cache.match(PAGINA_CANTIERE)),
  }
}

/** Attiva la versione nuova dell'app: la pagina si ricarica da sola (ServiceWorkerRegistration). */
async function attivaVersioneNuova(): Promise<boolean> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return false
  if (!reg.waiting) {
    await reg.update().catch(() => {})
    for (let i = 0; i < 40 && !reg.waiting; i++) await new Promise(r => setTimeout(r, 500))
  }
  if (!reg.waiting) return false
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

async function salvaPagina(): Promise<void> {
  const risposta = await fetch(PAGINA_CANTIERE, { credentials: 'same-origin' })
  // Mai salvare un rinvio (es. alla pagina di login) al posto della pagina vera.
  if (risposta.status === 200 && !risposta.redirected) {
    await (await caches.open(CACHE_CANTIERE)).put(PAGINA_CANTIERE, risposta)
  }
}

interface Props {
  catalogoPronto: boolean
  onScaricaCatalogo: () => Promise<void>
}

export default function ProntoOffline({ catalogoPronto, onScaricaCatalogo }: Props) {
  const [controlli, setControlli] = useState<Controlli | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [avviso, setAvviso] = useState<string | null>(null)
  const supportato = process.env.NODE_ENV === 'production' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined'

  const verifica = useCallback(async () => {
    try {
      setControlli(await controlla())
    } catch {
      setControlli({ aggiornamentoInAttesa: false, paginaSalvata: false })
    }
  }, [])

  useEffect(() => {
    if (!supportato) return
    void verifica()
    // Con la rete si tiene sempre aggiornata la copia della pagina.
    if (navigator.onLine) void salvaPagina().then(verifica).catch(() => {})
  }, [supportato, verifica])

  if (!supportato || !controlli) return null

  const pronto = !controlli.aggiornamentoInAttesa && controlli.paginaSalvata && catalogoPronto

  const prepara = async () => {
    if (!navigator.onLine) return
    setPreparando(true)
    try {
      if (controlli?.aggiornamentoInAttesa) {
        if (await attivaVersioneNuova()) return
        setAvviso('Non trovo la versione nuova: chiudi del tutto WinStudio (anche dalle app recenti) e riaprilo.')
      }
      await salvaPagina()
      if (!catalogoPronto) await onScaricaCatalogo()
      await verifica()
    } finally {
      setPreparando(false)
    }
  }

  if (pronto) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
        <CheckCircle2 className="size-5 shrink-0" />
        <span>Pronto per lavorare senza rete</span>
      </div>
    )
  }

  const manca = [
    controlli.aggiornamentoInAttesa && 'aggiornare l\'app',
    !controlli.paginaSalvata && 'salvare la pagina nel telefono',
    !catalogoPronto && 'scaricare il catalogo FP PRO',
  ].filter(Boolean)

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-5 shrink-0" />
        <span>Non ancora pronto per lavorare senza rete: serve {manca.join(', ')}.</span>
      </div>
      {avviso && <p>{avviso}</p>}
      <Button className="h-11 w-full" onClick={prepara} disabled={preparando || !navigator.onLine}>
        {preparando && <Loader2 className="mr-2 size-4 animate-spin" />}
        {navigator.onLine ? 'Prepara (meglio con il Wi-Fi)' : 'Serve la rete per preparare il telefono'}
      </Button>
    </div>
  )
}
