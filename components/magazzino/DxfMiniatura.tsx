'use client'

import { useState, useEffect } from 'react'
import { Loader2, FileCode2 } from 'lucide-react'
import { parseDxfUrl, type DxfResult } from '@/lib/dxf'

interface Props {
  url: string
  size?: number
}

export default function DxfMiniatura({ url, size = 48 }: Props) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [dxf, setDxf] = useState<DxfResult | null>(null)

  useEffect(() => {
    let cancelled = false
    parseDxfUrl(url)
      .then((result) => { if (!cancelled) { setDxf(result); setStatus('ok') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [url])

  const style = { width: size, height: size }

  if (status === 'loading') {
    return (
      <div className="rounded-md bg-gray-900 border border-gray-700 flex items-center justify-center" style={style}>
        <Loader2 className="h-3 w-3 text-gray-500 animate-spin" />
      </div>
    )
  }

  if (status === 'error' || !dxf) {
    return (
      <div className="rounded-md bg-gray-900 border border-gray-700 flex items-center justify-center" style={style}>
        <FileCode2 className="h-5 w-5 text-green-400" />
      </div>
    )
  }

  return (
    <div className="rounded-md bg-gray-900 border border-gray-700 overflow-hidden" style={style}>
      <svg
        viewBox={dxf.viewBox}
        width={size}
        height={size}
        style={{ transform: 'scaleY(-1)' }}
      >
        {dxf.paths.map((d, i) => (
          <path key={i} d={d} stroke="#4ade80" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  )
}
