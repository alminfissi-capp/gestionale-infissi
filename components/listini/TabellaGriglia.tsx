import type { GrigliaData } from '@/types/listino'

interface Props {
  data: GrigliaData
}

function formatEuro(n: number) {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TabellaGriglia({ data }: Props) {
  const { larghezze, altezze, griglia } = data

  if (larghezze.length === 0 || altezze.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Nessuna griglia prezzi disponibile.</p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="text-xs w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-500 border-b border-r whitespace-nowrap">
              H \ L (mm)
            </th>
            {larghezze.map((l) => (
              <th
                key={l}
                className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-r whitespace-nowrap"
              >
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {altezze.map((h, idx) => (
            <tr key={h} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-1.5 font-semibold text-gray-600 border-r whitespace-nowrap">
                {h}
              </td>
              {larghezze.map((l) => {
                const price = griglia[h.toString()]?.[l.toString()]
                return (
                  <td
                    key={l}
                    className={`px-3 py-1.5 text-right border-r whitespace-nowrap ${
                      price ? 'text-gray-900' : 'text-gray-300'
                    }`}
                  >
                    {price ? `€ ${formatEuro(price)}` : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
