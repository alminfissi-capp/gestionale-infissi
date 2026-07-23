'use client'

import { ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  url: string | null
  nome: string
  onClose: () => void
}

/** Visualizzatore file (PDF/immagini) in una finestra dentro l'app, via iframe. */
export default function DialogVisualizzatore({ url, nome, onClose }: Props) {
  return (
    <Dialog open={!!url} onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide className="gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b border-gray-200 p-3 pr-12 dark:border-gray-800">
          <DialogTitle className="truncate text-sm">{nome}</DialogTitle>
          {url && (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Apri a schermo intero
              </a>
            </Button>
          )}
        </DialogHeader>
        {url && (
          <iframe src={url} title={nome} className="min-h-0 w-full flex-1 border-0 bg-white" />
        )}
      </DialogContent>
    </Dialog>
  )
}
