'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ClientiPdfDocument from './ClientiPdfDocument'
import type { Cliente } from '@/types/cliente'

interface Props {
  clienti:       Cliente[]
  totaleClienti: number
  denominazione: string
}

export default function ClientiPdfButton({ clienti, totaleClienti, denominazione }: Props) {
  return (
    <PDFDownloadLink
      document={
        <ClientiPdfDocument
          clienti={clienti}
          denominazione={denominazione}
          totaleClienti={totaleClienti}
          dataGenerazione={new Date().toLocaleDateString('it-IT')}
        />
      }
      fileName={`clienti-${new Date().toISOString().slice(0, 10)}.pdf`}
    >
      {({ loading }) => (
        <Button variant="outline" disabled={loading}>
          <FileDown className="h-4 w-4 mr-1" />
          {loading ? 'Generazione...' : 'Esporta PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
