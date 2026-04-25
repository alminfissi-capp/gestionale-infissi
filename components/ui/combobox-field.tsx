'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
}

export function ComboboxField({
  options,
  value,
  onChange,
  placeholder = 'Seleziona...',
  searchPlaceholder = 'Cerca...',
  emptyText = 'Nessun risultato',
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-9 px-3', className)}
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate">{selected.label}</span>
              {selected.sublabel && (
                <span className="text-muted-foreground text-xs shrink-0">{selected.sublabel}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.sublabel ?? ''}`}
                  onSelect={() => { onChange(opt.value); setOpen(false) }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{opt.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
