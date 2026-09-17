'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { formatEuro } from '@/lib/pricing'
import { calcolaRitenutaPer, nettoIncassato, type TipoRitenuta } from '@/lib/ritenuta-acconto'

interface Props {
  /** Lordo pagato dal cliente: la trattenuta si ricalcola quando cambia. */
  importo: number
  ritenuta: number
  /** Quale delle due e' accesa. `null` = nessuna, ed e' lo stato normale. */
  tipo: TipoRitenuta | null
  /** Quota imponibile della commessa (`quotaImponibile`): la usa solo il 4%. */
  quota: number
  onChange: (ritenuta: number, tipo: TipoRitenuta | null) => void
  /**
   * Le aziende non fanno la detrazione fiscale e i privati non sono sostituti
   * d'imposta: sulle loro commesse la spunta che non c'entra resta visibile ma
   * spenta, perche' nasconderla lascerebbe senza risposta chi la cerca. Vuote
   * quando il tipo di cliente non si conosce — le commesse salvano solo il nome,
   * e un cliente fuori anagrafica non ha un tipo.
   */
  motivoDetrazioniDisabilitata?: string | null
  motivoCondominioDisabilitata?: string | null
  id: string
}

const ETICHETTE: Record<TipoRitenuta, string> = {
  detrazioni: 'Bonifico per detrazioni fiscali — ritenuta 11%',
  condominio: 'Pagamento da condominio — ritenuta 4%',
}

const TRATTIENE: Record<TipoRitenuta, string> = {
  detrazioni: 'La banca trattiene',
  condominio: 'Il condominio trattiene',
}

/**
 * Le due ritenute che possono colpire un incasso, in un selettore a tre stati:
 * accendendone una si spegne l'altra, entrambe spente = nessuna ritenuta.
 *
 * Sono alternative per come funziona la norma, non per comodita': se il
 * pagamento arriva col bonifico parlante, il condominio non applica anche il 4%.
 */
export default function SpuntaRitenuta({
  importo,
  ritenuta,
  tipo,
  quota,
  onChange,
  motivoDetrazioniDisabilitata,
  motivoCondominioDisabilitata,
  id,
}: Props) {
  const attivo = ritenuta > 0 ? tipo : null

  const righe: { t: TipoRitenuta; motivo?: string | null }[] = [
    { t: 'detrazioni', motivo: motivoDetrazioniDisabilitata },
    { t: 'condominio', motivo: motivoCondominioDisabilitata },
  ]

  return (
    <div className="space-y-2">
      {righe.map(({ t, motivo }) => {
        const disabilitata = !!motivo && attivo !== t
        const anteprima = calcolaRitenutaPer(t, importo, quota)

        return (
          <div key={t} className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Checkbox
                id={`${id}-${t}`}
                checked={attivo === t}
                disabled={disabilitata}
                // Accendere una spegne l'altra: l'onChange porta sempre tipo e
                // cifra insieme, cosi' non possono finire in disaccordo.
                onCheckedChange={(v) =>
                  v === true ? onChange(calcolaRitenutaPer(t, importo, quota), t) : onChange(0, null)
                }
                className="mt-0.5"
              />
              <label
                htmlFor={`${id}-${t}`}
                className={`text-sm leading-snug ${disabilitata ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}
              >
                {ETICHETTE[t]}
              </label>
            </div>

            {disabilitata ? (
              <p className="text-xs text-gray-400 pl-6">{motivo}</p>
            ) : attivo === t ? (
              // Il conto in chiaro prima di salvare: il numero che finisce in
              // banca non e' quello digitato, ed e' meglio vederlo che fidarsi.
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 ml-6">
                {TRATTIENE[t]} <strong>{formatEuro(ritenuta)}</strong> e li versa all&apos;Erario:
                {' '}ti arrivano <strong>{formatEuro(nettoIncassato(importo, ritenuta))}</strong>.
                {' '}Il cliente ha comunque pagato {formatEuro(importo)}.
              </p>
            ) : attivo === null && importo > 0 ? (
              <p className="text-xs text-gray-400 pl-6">
                Spuntando: trattenuta {formatEuro(anteprima)}, incassati{' '}
                {formatEuro(nettoIncassato(importo, anteprima))}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
