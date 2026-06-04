'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface SignaturePadProps {
  onChange: (base64: string | null) => void
  className?: string
}

export default function SignaturePad({ onChange, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // Sfondo bianco esplicito (necessario per PNG opaco in react-pdf)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = e.clientX
    const clientY = e.clientY
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }, [onChange])

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const onDown = (e: MouseEvent) => {
      drawing.current = true
      const pos = getPos(e, canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
    const onMove = (e: MouseEvent) => {
      if (!drawing.current) return
      const pos = getPos(e, canvas)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      hasDrawn.current = true
    }
    const onUp = () => {
      if (!drawing.current) return
      drawing.current = false
      emitChange()
    }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp)
    }
  }, [emitChange])

  // Touch events
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const onStart = (e: TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const pos = getPos(e.touches[0], canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      const pos = getPos(e.touches[0], canvas)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      hasDrawn.current = true
    }
    const onEnd = () => {
      if (!drawing.current) return
      drawing.current = false
      emitChange()
    }

    canvas.addEventListener('touchstart', onStart, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onEnd)
    return () => {
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onEnd)
    }
  }, [emitChange])

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
    onChange(null)
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 text-gray-400 hover:text-gray-600 text-xs"
        onClick={handleClear}
      >
        Cancella
      </Button>
    </div>
  )
}
