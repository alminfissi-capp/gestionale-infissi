'use client'

// Immagine di FP PRO salvata nel telefono (Blob in IndexedDB).
import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

export default function ImmagineStruttura({ path, className }: { path: string | null; className?: string }) {
  const riga = useLiveQuery(() => (path ? db.fpImmagini.get(path) : undefined), [path])
  const url = useMemo(() => (riga ? URL.createObjectURL(riga.blob) : null), [riga])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!url) return <div className={`grid place-items-center bg-muted text-[10px] text-muted-foreground ${className ?? ''}`}>…</div>
  return <img src={url} alt="" className={`object-contain bg-white ${className ?? ''}`} />
}
