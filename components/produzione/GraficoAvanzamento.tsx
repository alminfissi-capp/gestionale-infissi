// components/produzione/GraficoAvanzamento.tsx
import type { Avanzamento } from '@/lib/avanzamento'

/**
 * Anello di avanzamento: una fetta per attività programmata, colorata col
 * colore del suo tipo quando l'attività è completata, grigia finché non lo è.
 * Senza attività resta un cerchio grigio chiaro: non è "0% fatto", è "non
 * c'è ancora niente in programma".
 */
export default function GraficoAvanzamento({
  avanzamento,
  dimensione = 46,
  spessore = 7,
  etichetta = false,
}: {
  avanzamento: Avanzamento
  dimensione?: number
  spessore?: number
  /** Aggiunge sotto l'anello il conteggio delle attività completate. */
  etichetta?: boolean
}) {
  const { totale, completate, percentuale, fette } = avanzamento
  const vuoto = totale === 0

  const centro = dimensione / 2
  const raggio = (dimensione - spessore) / 2
  const circonferenza = 2 * Math.PI * raggio
  const passo = circonferenza / Math.max(totale, 1)
  // Lo stacco fra le fette fa contare le fasi a colpo d'occhio, ma su una
  // fetta sola non serve e su tante mangerebbe il colore.
  const stacco = totale > 1 ? Math.min(3, passo * 0.15) : 0
  const lunghezza = Math.max(passo - stacco, 0.5)

  const descrizione = vuoto
    ? 'Nessuna attività programmata'
    : `${percentuale}% completato, ${completate} attività su ${totale}`

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={dimensione}
        height={dimensione}
        viewBox={`0 0 ${dimensione} ${dimensione}`}
        role="img"
        aria-label={descrizione}
      >
        <title>{descrizione}</title>
        <g transform={`rotate(-90 ${centro} ${centro})`}>
          {vuoto ? (
            <circle
              cx={centro} cy={centro} r={raggio}
              fill="none"
              strokeWidth={spessore}
              className="stroke-gray-100 dark:stroke-gray-800"
            />
          ) : (
            fette.map((fetta, i) => (
              <circle
                key={i}
                cx={centro} cy={centro} r={raggio}
                fill="none"
                strokeWidth={spessore}
                stroke={fetta.completata ? fetta.colore : undefined}
                className={fetta.completata ? undefined : 'stroke-gray-200 dark:stroke-gray-700'}
                strokeDasharray={`${lunghezza} ${circonferenza}`}
                strokeDashoffset={-i * passo}
              />
            ))
          )}
        </g>
        <text
          x={centro} y={centro}
          textAnchor="middle" dominantBaseline="central"
          fontSize={dimensione * (vuoto ? 0.3 : 0.28)}
          fontWeight={600}
          className={vuoto
            ? 'fill-gray-300 dark:fill-gray-700'
            : 'fill-gray-700 dark:fill-gray-200'}
        >
          {vuoto ? '—' : `${percentuale}%`}
        </text>
      </svg>
      {etichetta && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {vuoto ? 'Nessuna attività' : `${completate} di ${totale} completate`}
        </span>
      )}
    </div>
  )
}
