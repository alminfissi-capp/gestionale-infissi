'use client'

import { useEffect, useRef } from 'react'

export default function TracciaVisita({ token }: { token: string }) {
  const inviato = useRef(false)

  useEffect(() => {
    if (inviato.current) return
    inviato.current = true
    fetch(`/api/track/ordine/${token}/visita`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {
      // Il tracking non deve mai disturbare il fornitore.
    })
  }, [token])

  return null
}
