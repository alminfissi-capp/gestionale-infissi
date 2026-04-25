'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseDxfUrl, type DxfResult } from '@/lib/dxf'

interface Props {
  signedUrl: string
  fileName?: string
}

export default function DxfViewer({ signedUrl, fileName }: Props) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [dxf, setDxf] = useState<DxfResult | null>(null)

  useEffect(() => {
    let cancelled = false
    parseDxfUrl(signedUrl)
      .then((result) => { if (!cancelled) { setDxf(result); setStatus('ok') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [signedUrl])

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-gray-950 overflow-hidden" style={{ height: 320 }}>
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center text-gray-400 gap-2">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">Preview non disponibile</p>
          </div>
        )}
        {status === 'ok' && dxf && (
          <svg
            viewBox={dxf.viewBox}
            className="w-full h-full"
            style={{ transform: 'scaleY(-1)' }}
          >
            {dxf.paths.map((d, i) => (
              <path key={i} d={d} stroke="#4ade80" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        )}
      </div>
      <a href={signedUrl} download={fileName ?? 'file.dxf'} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="gap-2 w-full">
          <Download className="h-3.5 w-3.5" />
          Scarica DXF
        </Button>
      </a>
    </div>
  )
}
