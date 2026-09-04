'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { formatEuro } from '@/lib/pricing'
import { calcolaRitenuta, nettoIncassato } from '@/lib/ritenuta-acconto'

interface Props {
  /** Lordo bonificato dal cliente: la trattenuta si ricalcola quando cambia. */
  importo: number
  ritenuta: number
  onChange: (ritenuta: number) => void
  /**
   * Le aziende non fanno la detrazione fiscale, quindi sulle loro commesse la
   * spunta resta visibile ma spenta: nasconderla lascerebbe senza risposta chi
   * la cerca. Vuota quando il tipo di cliente non si conosce — le commesse
   * salvano solo il nome, e un cliente fuori anagrafica non ha un tipo.
   */
  motivoDisabilitata?: string | null
  id: string
}

export default function SpuntaRitenuta({ importo, ritenuta, onChange, motivoDisabilitata, id }: Props) {
  const attiva = ritenuta > 0
  const disabilitata = !!motivoDisabilitata
  const anteprima = calcolaRitenuta(importo)

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={attiva}
          disabled={disabilitata}
          onCheckedChange={(v) => onChange(v === true ? calcolaRitenuta(importo) : 0)}
          className="mt-0.5"
        />
        <label
          htmlFor={id}
          className={`text-sm leading-snug ${disabilitata ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}
        >
          Bonifico per detrazioni fiscali — ritenuta 11%
        </label>
      </div>

      {disabilitata ? (
        <p className="text-xs text-gray-400 pl-6">{motivoDisabilitata}</p>
      ) : attiva ? (
        // Il conto in chiaro prima di salvare: il numero che finisce in banca non
        // e' quello digitato, ed e' meglio vederlo che fidarsi.
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 ml-6">
          La banca trattiene <strong>{formatEuro(ritenuta)}</strong> e li versa all&apos;Erario:
          {' '}ti arrivano <strong>{formatEuro(nettoIncassato(importo, ritenuta))}</strong>.
          {' '}Il cliente ha comunque pagato {formatEuro(importo)}.
        </p>
      ) : importo > 0 ? (
        <p className="text-xs text-gray-400 pl-6">
          Spuntando: trattenuta {formatEuro(anteprima)}, incassati {formatEuro(nettoIncassato(importo, anteprima))}
        </p>
      ) : null}
    </div>
  )
}
