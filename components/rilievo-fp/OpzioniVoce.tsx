'use client'

// Opzioni della voce in forma semplice (spec 2026-10-25-opzioni-semplici-voce-design.md):
// poche domande chiare (cerniere a vista / a scomparsa, maniglia, serratura…), gli accessori
// facoltativi del kit scelto, le aggiunte sì/no e, chiuso, l'elenco completo (Avanzate).
// Le scelte finiscono in fp.kit / fp.accessori come sempre: il calcolo non cambia.
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  accessoriOpzionali, kitOpzionali, sceltaKit, type AccessorioOpzionale, type GruppoAccessoriOpzionali,
} from '@/lib/fppro/rilievo-fp'
import {
  accessorioAttivo, domandeAccessori, domandeDoppie, kitAttivo, scegliAccessorio, scegliFamiglia, scegliKit, sceltoIn,
  type Domanda, type DomandaAccessori, type KitVoce, type SchemaOpzioni,
} from '@/lib/fppro/opzioni-voce'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import type { VoceFpDati } from '@/types/rilievo-fp'

interface Props {
  albero: NodoStruttura[]
  schema: SchemaOpzioni
  v: VoceFpDati
  onCambia: (patch: Partial<VoceFpDati>) => void
}

const nomeKit = (k: { descrizione: string; codice: string }) => k.descrizione || k.codice

function Riga({ tipo, attiva, onClick, testo, sotto }: { tipo: 'radio' | 'checkbox'; attiva: boolean; onClick: () => void; testo: string; sotto?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type={tipo} className="mt-0.5 size-4" checked={attiva} onChange={onClick} />
      <span className="min-w-0"><span className="block">{testo}</span>{sotto && <span className="block text-xs text-muted-foreground">{sotto}</span>}</span>
    </label>
  )
}

/** Accessori facoltativi di un kit: domande per gruppo di FP PRO + caselle per gli altri. */
function AccessoriDelKit({ gruppo, scelte, onCambia }: {
  gruppo: GruppoAccessoriOpzionali; scelte: Record<string, boolean> | undefined; onCambia: (s: Record<string, boolean>) => void
}) {
  const { domande, caselle } = domandeAccessori(gruppo)
  const casella = (a: AccessorioOpzionale) => (
    <Riga key={a.chiave} tipo="checkbox" attiva={accessorioAttivo(a, scelte)} testo={nomeKit(a)} sotto={a.codice}
      onClick={() => onCambia({ ...(scelte ?? {}), [a.chiave]: !accessorioAttivo(a, scelte) })} />
  )
  const domanda = (d: DomandaAccessori) => (
    <div key={d.id} className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{d.titolo}</p>
      {d.tipo === 'multipla'
        ? d.accessori.map(casella)
        : (
          <>
            {d.accessori.map(a => (
              <Riga key={a.chiave} tipo="radio" attiva={accessorioAttivo(a, scelte) && d.accessori.find(x => accessorioAttivo(x, scelte)) === a}
                testo={nomeKit(a)} sotto={a.codice} onClick={() => onCambia(scegliAccessorio(d, a.chiave, scelte))} />
            ))}
            <Riga tipo="radio" attiva={!d.accessori.some(a => accessorioAttivo(a, scelte))} testo="Nessuno" onClick={() => onCambia(scegliAccessorio(d, null, scelte))} />
          </>
        )}
    </div>
  )
  if (domande.length === 0 && caselle.length === 0) return null
  return <div className="ml-6 space-y-2 border-l pl-2">{domande.map(domanda)}{caselle.map(casella)}</div>
}

function DomandaKit({ d, v, onKit }: { d: Domanda; v: VoceFpDati; onKit: (kit: Record<string, boolean>) => void }) {
  const scelto = sceltoIn(d, v.kit)
  if (d.tipo === 'cerniere') {
    return (
      <div className="space-y-1">
        <div className="flex gap-1">
          {(['vista', 'scomparsa'] as const).map(f => (
            <Button key={f} type="button" size="sm" variant={scelto?.famiglia === f ? 'default' : 'outline'} className="flex-1"
              onClick={() => onKit(scegliFamiglia(d, f, v.mano, v.kit))}>
              {f === 'vista' ? 'A vista' : 'A scomparsa'}
            </Button>
          ))}
        </div>
        {scelto && <p className="text-xs text-muted-foreground">Kit: {scelto.codice}</p>}
      </div>
    )
  }
  if (d.tipo === 'multipla') {
    return <>{d.kit.map(k => <Riga key={k.chiave} tipo="checkbox" attiva={kitAttivo(k, v.kit)} testo={nomeKit(k)} sotto={k.codice} onClick={() => onKit({ ...v.kit, [k.chiave]: !kitAttivo(k, v.kit) })} />)}</>
  }
  return (
    <>
      {d.kit.map(k => (
        <Riga key={k.chiave} tipo="radio" attiva={scelto?.chiave === k.chiave} testo={nomeKit(k)} sotto={k.codice} onClick={() => onKit(scegliKit(d, k.chiave, v.kit))} />
      ))}
      {d.tipo === 'facoltativa' && <Riga tipo="radio" attiva={!scelto} testo="Nessuno" onClick={() => onKit(scegliKit(d, null, v.kit))} />}
    </>
  )
}

export default function OpzioniVoce({ albero, schema, v, onCambia }: Props) {
  const gruppiAcc = useMemo(() => accessoriOpzionali(albero), [albero])
  const tuttiKit = useMemo(() => kitOpzionali(albero), [albero])
  const doppie = domandeDoppie(schema, v.kit)
  const onKit = (kit: Record<string, boolean>) => onCambia({ kit })
  const onAcc = (accessori: Record<string, boolean>) => onCambia({ accessori })
  const accessoriDi = (k: KitVoce) => gruppiAcc.filter(g => g.kit === k.chiave)
  // Accessori facoltativi di kit obbligatori, kit base e accessori sciolti: sempre visibili.
  const accessoriFissi = gruppiAcc.filter(g => g.kit === null || schema.base.some(k => k.chiave === g.kit && kitAttivo(k, v.kit)))

  return (
    <div className="space-y-3">
      {doppie.map(d => (
        <p key={d.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {d.titolo}: sono scelti più kit alternativi ({d.kit.filter(k => kitAttivo(k, v.kit)).map(k => k.codice).join(' + ')}). Scegline uno.
        </p>
      ))}

      {schema.domande.map(d => (
        <div key={d.id} className="space-y-1">
          <p className="text-sm font-medium">{d.titolo}</p>
          <DomandaKit d={d} v={v} onKit={onKit} />
          {d.kit.filter(k => kitAttivo(k, v.kit)).flatMap(accessoriDi).map((g, i) => (
            <AccessoriDelKit key={i} gruppo={g} scelte={v.accessori} onCambia={onAcc} />
          ))}
        </div>
      ))}

      {accessoriFissi.map((g, i) => (
        <div key={`f${i}`} className="space-y-1">
          <p className="text-sm font-medium">{g.titolo}</p>
          <AccessoriDelKit gruppo={g} scelte={v.accessori} onCambia={onAcc} />
        </div>
      ))}

      {schema.altre.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Altre opzioni</p>
          {schema.altre.map(k => (
            <div key={k.chiave}>
              <Riga tipo="checkbox" attiva={kitAttivo(k, v.kit)} testo={nomeKit(k)} sotto={k.codice} onClick={() => onKit({ ...v.kit, [k.chiave]: !kitAttivo(k, v.kit) })} />
              {kitAttivo(k, v.kit) && accessoriDi(k).map((g, i) => <AccessoriDelKit key={i} gruppo={g} scelte={v.accessori} onCambia={onAcc} />)}
            </div>
          ))}
        </div>
      )}

      {tuttiKit.length > 0 && (
        <details className="rounded border p-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">Avanzate: tutti i kit di FP PRO</summary>
          <div className="mt-2 space-y-2">
            {tuttiKit.map(k => {
              const attivo = v.kit[k.chiave] ?? k.predefinito
              return (
                <div key={k.chiave} className="space-y-1">
                  <Riga tipo={k.alternative ? 'radio' : 'checkbox'} attiva={attivo} testo={nomeKit(k)} sotto={k.codice}
                    onClick={() => onKit(sceltaKit(tuttiKit, v.kit, k.chiave, k.alternative ? true : !attivo))} />
                  {attivo && gruppiAcc.filter(g => g.kit === k.chiave).map((g, i) => (
                    <div key={i} className="ml-6 space-y-1 border-l pl-2">
                      {g.accessori.map(a => (
                        <Riga key={a.chiave} tipo="checkbox" attiva={accessorioAttivo(a, v.accessori)} testo={nomeKit(a)} sotto={a.codice}
                          onClick={() => onAcc({ ...(v.accessori ?? {}), [a.chiave]: !accessorioAttivo(a, v.accessori) })} />
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
