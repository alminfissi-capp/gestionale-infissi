'use client'

import { useState, useEffect } from 'react'
import { formatEuro } from '@/lib/pricing'
import type { GrigliaData } from '@/types/listino'

// Cella editabile con stato locale — aggiorna il parent solo onBlur
function PriceCell({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  const toLocal = (v: number | undefined) => (v != null && v !== 0 ? String(v) : '')
  const [local, setLocal] = useState(() => toLocal(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(toLocal(value))
  }, [value, focused])

  return (
    <input
      type="number"
      className="w-full min-w-[72px] px-2 py-1.5 text-right bg-transparent focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-300 text-gray-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      value={local}
      step="0.01"
      min="0"
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        setFocused(false)
        const num = parseFloat(e.target.value.replace(',', '.'))
        onChange(isNaN(num) ? 0 : num)
      }}
    />
  )
}

interface Props {
  data: GrigliaData
  editable?: boolean
  onChange?: (data: GrigliaData) => void
}

export default function TabellaGriglia({ data, editable, onChange }: Props) {
  const { larghezze, altezze, griglia } = data

  if (larghezze.length === 0 || altezze.length === 0) {
    return <p className="text-sm text-gray-400 italic">Nessuna griglia prezzi disponibile.</p>
  }

  const handleCellChange = (h: number, l: number, value: number) => {
    onChange?.({
      larghezze,
      altezze,
      griglia: {
        ...griglia,
        [h.toString()]: {
          ...griglia[h.toString()],
          [l.toString()]: value,
        },
      },
    })
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
                  <td key={l} className="border-r p-0">
                    {editable ? (
                      <PriceCell
                        value={price}
                        onChange={(v) => handleCellChange(h, l, v)}
                      />
                    ) : (
                      <span
                        className={`block px-3 py-1.5 text-right whitespace-nowrap ${
                          price ? 'text-gray-900' : 'text-gray-300'
                        }`}
                      >
                        {price ? `€ ${formatEuro(price)}` : '—'}
                      </span>
                    )}
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
