// components/calendario/StampaGantt.tsx
'use client'

/**
 * Regole di stampa del calendario di produzione: A4 orizzontale, senza
 * comandi ne' coda laterale, coi colori delle barre conservati.
 * Non disegna nulla: inietta soltanto il foglio di stile.
 */
export default function StampaGantt() {
  return (
    <style>{`
      @page { size: A4 landscape; margin: 8mm; }
      @media print {
        .no-stampa { display: none !important; }
        /* La griglia non deve scorrere: in stampa sta tutta in larghezza */
        .gantt-scroll { overflow: visible !important; }
        .gantt-scroll > div { min-width: 0 !important; }
        /* Una riga-giorno non si spezza fra due pagine */
        .gantt-giorno { break-inside: avoid; }
      }
    `}</style>
  )
}
