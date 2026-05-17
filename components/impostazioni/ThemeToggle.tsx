'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

const OPTIONS = [
  { value: 'light',  icon: Sun,     label: 'Chiaro'  },
  { value: 'dark',   icon: Moon,    label: 'Scuro'   },
  { value: 'system', icon: Monitor, label: 'Sistema' },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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
