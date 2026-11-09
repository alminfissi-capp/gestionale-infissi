'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { cambiaPreferenzaFp } from '@/lib/preferenze-fp'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import SceltaColore from '@/components/rilievo-fp/SceltaColore'
import ColoriAccessori from '@/components/rilievo-fp/ColoriAccessori'
import AccessoriAggiunti from '@/components/rilievo-fp/AccessoriAggiunti'
import type { VoceGraficoDati } from '@/types/rilievo-fp'

/**
 * Colori e accessori della voce disegnata. Colori dagli elenchi di FP PRO nel dispositivo
 * (anche senza rete); i colori accessori sono tutti quelli per gli accessori, perche' la voce
 * disegnata non ha kit da cui filtrarli.
 */
export default function PannelloFinitura({ g, onCambia }: { g: VoceGraficoDati; onCambia: (g: VoceGraficoDati) => void }) {
  const { isOnline } = useOnlineStatus()
  const colori = useLiveQuery(() => db.fpColori.filter(c => c.presente).toArray(), [], [])
  const preferenze = useLiveQuery(() => db.fpPreferenze.where('tipo').equals('colore').toArray(), [], [])
  const preferiti = new Set(preferenze.map(p => String(p.rif)))
  const vociProfili = colori.filter(c => c.per_profili !== false).map(c => ({ id: String(c.fp_id), testo: c.descrizione }))
  const vociAccessori = colori.filter(c => c.per_accessori === true).map(c => ({ id: String(c.fp_id), testo: c.descrizione }))

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Colore</p>
        <SceltaColore int={g.coloreInt} est={g.coloreEst} voci={vociProfili} preferiti={preferiti}
          onStella={(x, attiva) => void cambiaPreferenzaFp('colore', x.id, attiva)} onCambia={c => onCambia({ ...g, ...c })} />
      </div>
      <div className="space-y-1 border-t pt-3">
        <p className="text-sm font-medium">Colori accessori</p>
        <ColoriAccessori lista={g.coloriAcc ?? []} voci={vociAccessori} onCambia={lista => onCambia({ ...g, coloriAcc: lista })} />
      </div>
      <div className="border-t pt-3">
        <AccessoriAggiunti lista={g.accessoriAggiunti ?? []} isOnline={isOnline} onCambia={lista => onCambia({ ...g, accessoriAggiunti: lista })} />
      </div>
      {colori.length === 0 && <p className="text-xs text-amber-700">Elenco colori non ancora nel dispositivo: aggiorna il catalogo con la rete.</p>}
    </div>
  )
}
