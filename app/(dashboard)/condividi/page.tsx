import ImbutoCondivisione from '@/components/condivisione/ImbutoCondivisione'

/**
 * Dove atterra un file condiviso da Android.
 *
 * Sta dentro il gruppo (dashboard) per ereditarne l'autenticazione: se la
 * sessione e' scaduta il login scatta prima, e al ritorno il file e' ancora nel
 * database locale del dispositivo, quindi non si perde.
 */
export default async function CondividiPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; dettagli?: string }>
}) {
  const { errore, dettagli } = await searchParams

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salva nel gestionale</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Scegli dove far finire il file che hai condiviso
        </p>
      </div>
      <ImbutoCondivisione errore={errore} dettagli={dettagli} />

      {/* Spia per quando il codice della pagina non si avvia sul dispositivo: lo
          script parte comunque, e se dopo 12 secondi l'imbuto non ha segnalato di
          essersi avviato mostra questo riquadro. */}
      <div id="spia-condividi" hidden className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2 text-sm">
        <p className="font-semibold text-amber-900">La pagina non si è avviata sul dispositivo</p>
        <p className="text-amber-900">
          Il codice dell&apos;app non è partito. Riferisci a chi ti assiste la riga qui sotto (anche con uno
          screenshot), poi prova a ricaricare.
        </p>
        <p id="spia-condividi-dettagli" className="rounded border bg-white p-2 font-mono text-xs text-gray-700 break-all" />
        <a href="/condividi" className="inline-block rounded-md border bg-white px-3 py-1.5 text-sm font-medium">
          Ricarica
        </a>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){try{if(window.__condividiPronto)return;var b=document.getElementById('spia-condividi');var d=document.getElementById('spia-condividi-dettagli');var sw=navigator.serviceWorker&&navigator.serviceWorker.controller;if(d)d.textContent='Service worker: '+(sw?sw.scriptURL:'nessuno')+' | IndexedDB: '+(window.indexedDB?'si':'no')+' | '+navigator.userAgent;if(b)b.hidden=false}catch(e){}},12000)`,
        }}
      />
    </div>
  )
}
