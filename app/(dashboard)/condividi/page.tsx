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
  searchParams: Promise<{ errore?: string }>
}) {
  const { errore } = await searchParams

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salva nel gestionale</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Scegli dove far finire il file che hai condiviso
        </p>
      </div>
      <ImbutoCondivisione errore={errore} />
    </div>
  )
}
