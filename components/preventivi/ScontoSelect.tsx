'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

interface Props {
  value: number
  onChange: (value: number) => void
  max?: number
  className?: string
}

export default function ScontoSelect({ value, onChange, max = 50, className }: Props) {
  const options = Array.from({ length: Math.floor(max / 5) + 1 }, (_, i) => i * 5)

  return (
    <Select value={value.toString()} onValueChange={(v) => onChange(parseInt(v))}>
      <SelectTrigger className={className}>
        <span className="mr-auto">{value}%</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o.toString()}>
            {o}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
