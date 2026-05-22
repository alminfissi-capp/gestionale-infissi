import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import PreventivoPdf from './preventivoPdf'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

export async function generatePreventivoPdf(
  preventivo: PreventivoCompleto,
  settings: Settings | null,
  logoUrl: string | null
): Promise<Buffer> {
  return renderToBuffer(
    <PreventivoPdf preventivo={preventivo} settings={settings} logoUrl={logoUrl} />
  )
}
