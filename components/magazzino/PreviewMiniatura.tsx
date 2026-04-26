'use client'

import { useState, memo } from 'react'
import { ImageIcon } from 'lucide-react'
import DxfMiniatura from './DxfMiniatura'

interface Props {
  url: string | null
  tipo: 'foto' | 'dxf' | null
  size?: number
}

function toMagazzinoUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/magazzino/${path}`
}

export function prodottoPreviewProps(fotoUrl: string | null, dxfUrl: string | null) {
  if (fotoUrl) return { url: toMagazzinoUrl(fotoUrl), tipo: 'foto' as const }
  if (dxfUrl) return { url: toMagazzinoUrl(dxfUrl), tipo: 'dxf' as const }
  return { url: null, tipo: null }
}

const PreviewMiniatura = memo(function PreviewMiniatura({ url, tipo, size = 40 }: Props) {
  const [imgError, setImgError] = useState(false)
  const px = `${size}px`

  if (!url || !tipo) {
    return (
      <div
        className="rounded bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0"
        style={{ width: px, height: px }}
      >
        <ImageIcon className="h-4 w-4 text-gray-300" />
      </div>
    )
  }

  if (tipo === 'foto' && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="rounded object-cover border border-gray-200 bg-gray-50 shrink-0"
        style={{ width: px, height: px }}
        onError={() => setImgError(true)}
      />
    )
  }

  if (tipo === 'dxf') {
    return <DxfMiniatura url={url} size={size} />
  }

  return (
    <div
      className="rounded bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0"
      style={{ width: px, height: px }}
    >
      <ImageIcon className="h-4 w-4 text-gray-300" />
    </div>
  )
})

export default PreviewMiniatura
