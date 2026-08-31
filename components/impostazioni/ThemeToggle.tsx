'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Il valore non cambia mai dopo l'idratazione: non c'e' niente a cui iscriversi. */
const sottoscriviNulla = () => () => {}

const OPTIONS = [
  { value: 'light',  icon: Sun,     label: 'Chiaro'  },
  { value: 'dark',   icon: Moon,    label: 'Scuro'   },
  { value: 'system', icon: Monitor, label: 'Sistema' },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // Il tema vero si conosce solo dopo l'idratazione: prima si rende un
  // segnaposto della stessa altezza, per non far ballare il layout.
  // useSyncExternalStore da' false sul server e true sul client senza
  // bisogno di uno stato scritto dentro un effetto.
  const mounted = useSyncExternalStore(sottoscriviNulla, () => true, () => false)

  if (!mounted) return <div className="h-9" />

  return (
    <div className="flex gap-2">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant={theme === value ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => setTheme(value)}
        >
          <Icon className="h-4 w-4 mr-1.5" />
          {label}
        </Button>
      ))}
    </div>
  )
}
