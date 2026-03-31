'use client'

import { useState, useTransition } from 'react'
import { Mail, Paperclip, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatEuro } from '@/lib/pricing'
import type { PreventivoCompleto } from '@/types/preventivo'

interface Props {
  open: boolean
  onClose: () => void
  preventivo: PreventivoCompleto
  nomeCliente: string
}

async function generaPDF(p: PreventivoCompleto, nomeCliente: string): Promise<{ base64: string; filename: string }> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const dataFormattata = new Date(p.created_at).toLocaleDateString('it-IT')
  const s = p.cliente_snapshot

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 143, 156)
  doc.text(p.numero ? `Offerta N. ${p.numero}` : 'Preventivo', 14, 20)
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Data: ${dataFormattata}`, 14, 27)

  // Separatore
  doc.setDrawColor(14, 143, 156)
  doc.setLineWidth(0.5)
  doc.line(14, 31, 196, 31)

  // Dati cliente
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENTE', 14, 38)
  doc.setFont('helvetica', 'normal')
  let cy = 43
  doc.text(nomeCliente, 14, cy)
  if (s.email) { cy += 5; doc.text(s.email, 14, cy) }
  if (s.telefono) { cy += 5; doc.text(s.telefono, 14, cy) }
  if (s.cantiere) { cy += 5; doc.text(`Cantiere: ${s.cantiere}`, 14, cy) }

  // Tabella articoli
  const rows = p.articoli.map((a) => [
    [a.tipologia, a.note].filter(Boolean).join('\n') || '—',
    a.larghezza_mm && a.altezza_mm ? `${a.larghezza_mm}×${a.altezza_mm}` : '—',
    a.finitura_nome || '—',
    String(a.quantita),
    formatEuro(a.prezzo_unitario),
    formatEuro(a.prezzo_totale_riga),
  ])

  autoTable(doc, {
    startY: Math.max(cy + 8, 65),
    head: [['Descrizione', 'Misure (mm)', 'Finitura', 'Qty', 'P. Unit.', 'Totale']],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [14, 143, 156], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { halign: 'center', cellWidth: 28 },
      2: { cellWidth: 35 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 25 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = (doc as any).lastAutoTable?.finalY ?? 140

  // Totali
  const totali: [string, string][] = [['Subtotale', formatEuro(p.subtotale)]]
  if (p.importo_sconto > 0) totali.push([`Sconto ${p.sconto_globale}%`, `-${formatEuro(p.importo_sconto)}`])
  if (p.spese_trasporto > 0) totali.push(['Spese trasporto', formatEuro(p.spese_trasporto)])
  if (p.iva_totale > 0) totali.push(['IVA', formatEuro(p.iva_totale)])
  totali.push(['TOTALE', formatEuro(p.totale_finale)])

  let ty = lastY + 10
  for (const [label, value] of totali) {
    const isTot = label === 'TOTALE'
    doc.setFont('helvetica', isTot ? 'bold' : 'normal')
    doc.setFontSize(isTot ? 10.5 : 9.5)
    doc.setTextColor(isTot ? 14 : 80, isTot ? 143 : 80, isTot ? 156 : 80)
    doc.text(label, 130, ty)
    doc.text(value, 196, ty, { align: 'right' })
    if (isTot) {
      doc.setDrawColor(14, 143, 156)
      doc.setLineWidth(0.4)
      doc.line(128, ty - 5, 196, ty - 5)
    }
    ty += 7
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(160)
  doc.text(`Preventivo generato il ${new Date().toLocaleDateString('it-IT')}`, 14, pageH - 10)

  const dataUri = doc.output('datauristring')
  const base64 = dataUri.split(',')[1]
  const filename = p.numero ? `preventivo-${p.numero}.pdf` : 'preventivo.pdf'
  return { base64, filename }
}

export default function DialogInvioEmail({ open, onClose, preventivo: p, nomeCliente }: Props) {
  const router = useRouter()
  const [isSending, startSending] = useTransition()

  const defaultOggetto = p.numero ? `Preventivo n. ${p.numero}` : 'Preventivo'
  const defaultMessaggio = p.numero
    ? `Gentile ${nomeCliente},\n\nle inviamo in allegato il preventivo n. ${p.numero}.\n\nRimanendo a disposizione per qualsiasi informazione,\ncordiamo saluti.`
    : `Gentile ${nomeCliente},\n\nle inviamo in allegato il preventivo richiesto.\n\nRimanendo a disposizione per qualsiasi informazione,\ncordiamo saluti.`

  const [destinatario, setDestinatario] = useState(p.cliente_snapshot.email || '')
  const [oggetto, setOggetto] = useState(defaultOggetto)
  const [messaggio, setMessaggio] = useState(defaultMessaggio)

  const filenameLabel = p.numero ? `preventivo-${p.numero}.pdf` : 'preventivo.pdf'

  const handleInvia = () => {
    if (!destinatario.trim()) {
      toast.error('Inserire un indirizzo email')
      return
    }
    startSending(async () => {
      try {
        const { base64, filename } = await generaPDF(p, nomeCliente)

        const res = await fetch(`/api/preventivi/${p.id}/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinatario, oggetto, messaggio, pdfBase64: base64, filename }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Errore durante l\'invio')
        }

        toast.success('Email inviata con successo')
        router.refresh()
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Errore durante l\'invio')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSending) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invia preventivo via email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">A</Label>
            <Input
              id="email-to"
              type="email"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="email@cliente.it"
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-oggetto">Oggetto</Label>
            <Input
              id="email-oggetto"
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-messaggio">Messaggio</Label>
            <textarea
              id="email-messaggio"
              className="w-full min-h-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-50"
              value={messaggio}
              onChange={(e) => setMessaggio(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/50">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span>{filenameLabel}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Annulla
          </Button>
          <Button onClick={handleInvia} disabled={isSending || !destinatario.trim()}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Invio in corso…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Invia email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
