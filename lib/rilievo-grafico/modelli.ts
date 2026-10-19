// Modelli di forma esterna, copiati da C:\FP_PRO\Prm\MODELS (solo le righe di disegno).
// Tolti su richiesta: MODEL-61 (lunetta ad anello), 62 (arco con spalle), 63 (due
// archetti); tolte le copie identiche MODEL-12 (= 19) e MODEL-99 (= 10). Riscritti puliti:
// MODEL-68/69 (in FP PRO disegnano con trucchi: righe nascoste e salti) e MODEL-71
// (in FP PRO usa un'espressione che non torna).

export interface ModelloForma {
  id: string
  nome: string
  /** Etichetta di ogni misura chiesta, in ordine */
  misure: Record<string, string>
  /** Variabili dello script da non chiedere (calcolate da FP PRO) */
  nascoste?: string[]
  script: string
}

export const MODELLI: ModelloForma[] = [
  {
    id: 'MODEL-00', nome: 'Rettangolo',
    misure: { L: 'Larghezza', H: 'Altezza' },
    script: `VAR L=2000
VAR H=2000
ENDVAR
MOVETO 0,0
RECTANGLE L,H`,
  },
  {
    id: 'MODEL-01', nome: 'Trapezio (tetto inclinato)',
    misure: { L: 'Larghezza', H1: 'Altezza sinistra', H2: 'Altezza destra' },
    script: `VAR L=1500
VAR H1=1200
VAR H2=1700
ENDVAR
MOVETO 0,0
LINETO 0,H1
LINETO L,H2
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-02', nome: 'Casetta simmetrica',
    misure: { L: 'Larghezza', H1: 'Altezza ai lati', H2: 'Altezza al colmo' },
    script: `VAR L=1500
VAR H1=1200
VAR H2=1800
ENDVAR
MOVETO 0,0
LINETO 0,H1
LINETO L/2,H2
LINETO L,H1
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-03', nome: 'Casetta asimmetrica',
    misure: { L1: 'Da sinistra al colmo', L2: 'Dal colmo a destra', H1: 'Altezza sinistra', H2: 'Altezza destra', H3: 'Altezza al colmo' },
    script: `VAR L1=1000
VAR L2=1500
VAR H1=1200
VAR H2=1300
VAR H3=1800
ENDVAR
SET L=L1+L2
MOVETO 0,0
LINETO 0,H1
LINETO L1,H3
LINETO L,H2
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-04', nome: 'Triangolo',
    misure: { L1: 'Base fino al vertice', L2: 'Base dopo il vertice', H: 'Altezza del vertice' },
    script: `VAR L1=1000
VAR L2=700
VAR H=800
ENDVAR
SET L=L1+L2
MOVETO 0,0
LINETO L1,H
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-05', nome: 'Parallelogramma inclinato',
    misure: { L: 'Larghezza', H1: 'Altezza dei lati', H2: 'Dislivello a destra' },
    script: `VAR L=2000
VAR H1=1200
VAR H2=500
ENDVAR
SET H=H1+H2
MOVETO 0,0
LINETO 0,H1
LINETO L,H
LINETO L,H2
LINETO 0,0`,
  },
  {
    id: 'MODEL-06', nome: 'A "L"',
    misure: { L: 'Larghezza in alto', L1: 'Larghezza in basso', H1: 'Altezza dello scalino', H: 'Altezza totale' },
    script: `VAR L=2000
VAR L1=900
VAR H1=1200
VAR H=2300
ENDVAR
MOVETO 0,0
LINETO 0,H
LINETO L,H
LINETO L,H1
LINETO L1,H1
LINETO L1,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-07', nome: 'A "T" rovesciata',
    misure: { L1: 'Ala sinistra', L2: 'Parte centrale', L3: 'Ala destra', H: 'Altezza totale', H1: 'Altezza ala sinistra da terra', H2: 'Altezza ala destra da terra' },
    script: `VAR L1=700
VAR L2=1200
VAR L3=700
VAR H=2300
VAR H1=1200
VAR H2=1500
ENDVAR
SET L=L1+L2+L3
MOVETO L1,0
LINETO L1,H1
LINETO 0,H1
LINETO 0,H
LINETO L,H
LINETO L,H2
LINETO L-L3,H2
LINETO L-L3,0
LINETO L1,0`,
  },
  {
    id: 'MODEL-08', nome: 'Base inclinata',
    misure: { L: 'Larghezza', H1: 'Altezza sinistra', H2: 'Altezza destra' },
    script: `VAR L=1500
VAR H1=1700
VAR H2=1500
ENDVAR
IF H1>H2
SET Y1=0
SET Y2=H1-H2
SET H=H1
ELSE
SET Y1=H2-H1
SET Y2=0
SET H=H2
ENDIF
MOVETO 0,Y1
LINEREL 0,H1
LINEREL L,0
LINEREL 0,-H2
LINETO 0,Y1`,
  },
  {
    id: 'MODEL-09', nome: 'Trapezio (lati obliqui)',
    misure: { L1: 'Base', L2: 'Lato superiore', D: 'Rientro a sinistra in alto', H: 'Altezza' },
    script: `VAR L1=1500
VAR L2=1100
VAR D=300
VAR H=1200
ENDVAR
MOVETO 0,0
LINETO D,H
LINETO D+L2,H
LINETO L1,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-10', nome: 'Smusso su un angolo',
    misure: { L1: 'Larghezza', L2: 'Tratto dritto in alto', H1: 'Altezza sinistra', H2: 'Altezza destra' },
    script: `VAR L1=1500
VAR L2=900
VAR H1=2300
VAR H2=1600
ENDVAR
MOVETO 0,0
LINETO 0,H1
LINETO L2,H1
LINETO L1,H2
LINETO L1,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-11', nome: 'Quadrilatero libero',
    misure: { L1: 'Base', L2: 'Larghezza in alto', D: 'Rientro a sinistra in alto', H1: 'Altezza sinistra', H2: 'Altezza destra' },
    script: `VAR L1=1500
VAR L2=1100
VAR D=300
VAR H1=1200
VAR H2=1700
ENDVAR
MOVETO 0,0
LINETO D,H1
LINETO D+L2,H2
LINETO L1,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-19', nome: 'Doppio smusso',
    misure: { L1: 'Larghezza', L2: 'Smusso sinistro', L3: 'Smusso destro', H1: 'Altezza totale', H2: 'Altezza sinistra', H3: 'Altezza destra' },
    script: `VAR L1=3000
VAR L2=700
VAR L3=400
VAR H1=2300
VAR H2=1800
VAR H3=2000
ENDVAR
MOVETO 0,0
LINETO 0,H2
LINETO L2,H1
LINETO L1-L3,H1
LINETO L1,H3
LINETO L1,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-20', nome: 'A "L" specchiata',
    misure: { L: 'Larghezza in alto', L1: 'Larghezza in basso', H1: 'Altezza dello scalino', H: 'Altezza totale' },
    script: `VAR L=2000
VAR L1=900
VAR H1=1200
VAR H=2300
ENDVAR
SET L2=L-L1
SET H2=H-H1
MOVETO L2,0
LINEREL 0,H1
LINEREL -L2,0
LINEREL 0,H2
LINEREL L,0
LINEREL 0,-H
LINEREL -L1,0`,
  },
  {
    id: 'MODEL-50', nome: 'Arco a tutto sesto',
    misure: { L: 'Larghezza', H: 'Altezza in chiave' },
    script: `VAR L=1500
VAR H=2300
ENDVAR
MOVETO 0,0
SET H1=H-L/2
LINETO 0,H1
ARCTO L,H1,L/2,H1,-1
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-51', nome: 'Arco a sesto acuto (gotico)',
    misure: { L: 'Larghezza', H: 'Altezza in chiave' },
    script: `VAR L=1500
VAR H=2800
ENDVAR
MOVETO 0,0
SET H2=L* COS(30)
SET H1=H-H2
LINETO 0,H1
ARCTO L/2,H,L,H1,-1
ARCTO L,H1,0,H1,-1
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-52', nome: 'Oblò (cerchio)',
    misure: { D: 'Diametro' },
    script: `VAR D=1500
ENDVAR
MOVETO 0,0
CIRCLE D/2`,
  },
  {
    id: 'MODEL-53', nome: 'Mezzaluna',
    misure: { L: 'Larghezza' },
    script: `VAR L=1500
ENDVAR
MOVETO 0,0
ARCTO L/2,L/2,L/2,0,-1
ARCTO L,0,L/2,0,-1
LINETO 0,0`,
  },
  {
    id: 'MODEL-54', nome: 'Arco ribassato su rettangolo',
    misure: { L: 'Larghezza', H1: 'Altezza all\'imposta', H2: 'Freccia dell\'arco' },
    script: `VAR L=2500
VAR H1=2300
VAR H2=500
ENDVAR
SET H = H1 + H2
SET R = (4*H2**2 + L**2) / (8*H2)
SET XC = L/2
SET YC = H-R
MOVETO 0,0
LINETO 0,H1
ARCTO L/2,H,XC,YC,-1
ARCTO L,H1,XC,YC,-1
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-55', nome: 'Arco a tre centri',
    misure: { L: 'Larghezza', H1: 'Altezza all\'imposta', H2: 'Freccia dell\'arco' },
    nascoste: ['R1', 'AUTO'],
    script: `VAR L=4000
VAR H1=2500
VAR H2=1200
VAR R1=900
VAR AUTO=1
ENDVAR
IF AUTO=1
SET RATIO1 = H2/L
SET RATIO2 = -24.256*RATIO1**4+30.704*RATIO1**3-14.549*RATIO1**2+4.6343*RATIO1
SET R1 = RATIO2 * H2
ENDIF
SET H = H1+H2
SET F = H2-R1
SET D = L - 2*R1
SET R2 = R1 + ( 4*F**2 + D**2 ) / (8*F)
SET XC1 = R1
SET YC1 = H1
SET XC2 = L/2
SET YC2 = H-R2
SET XT1 = XC2 - ( R2 * (XC2-XC1) ) / (R2-R1)
SET YT1 = YC2 + ( R2 * (YC1-YC2) ) / (R2-R1)
SET XT2 = L - XT1
SET YT2 = YT1
MOVETO 0,0
IF R1 < H2
LINEREL 0,H1
ARCTO XT1,YT1,XC1,YC1,-1
ARCTO L/2,H,XC2,YC2,-1
ARCTO XT2,YT2,XC2,YC2,-1
ARCTO L,H1,L-XC1,YC1,-1
LINEREL 0,-H1
LINEREL -L,0
ENDIF
IF R1 = H2
LINEREL 0,H1
ARCTO R1,H,R1,H1,-1
LINEREL L-2*R1,0
ARCTO L,H1,L-R1,H1,-1
LINEREL 0,-H1
LINEREL -L,0
ENDIF`,
  },
  {
    id: 'MODEL-56', nome: 'Ovale',
    misure: { L: 'Larghezza', H: 'Altezza' },
    nascoste: ['R1', 'AUTO'],
    script: `VAR L=1200
VAR H=800
VAR R1=300
VAR AUTO=1
ENDVAR
SET H1 = H/2
IF AUTO=1
SET RATIO1 = H1/L
SET RATIO2 = -24.256*RATIO1**4+30.704*RATIO1**3-14.549*RATIO1**2+4.6343*RATIO1
SET R1 = RATIO2 * H1
ENDIF
SET F = H1-R1
SET D = L - 2*R1
SET R2 = R1 + ( 4*F**2 + D**2 ) / (8*F)
SET XC1 = -L/2 + R1
SET YC1 = 0
SET XC2 = 0
SET YC2 = H1-R2
SET XT1 = XC2 - ( R2 * (XC2-XC1) ) / (R2-R1)
SET YT1 = YC2 + ( R2 * (YC1-YC2) ) / (R2-R1)
SET XT2 = -1 * XT1
SET YT2 = YT1
SET XC3 = 0
SET YC3 = R2-H1
MOVETO -L/2,0
IF R1 < H/2
ARCTO XT1,YT1,XC1,YC1,-1
ARCTO 0,H1,XC2,YC2,-1
ARCTO XT2,YT2,XC2,YC2,-1
ARCTO L/2,0,-1*XC1,0,-1
ARCTO XT2,-1*YT2,-1*XC1,0,-1
ARCTO 0,-1*H1,XC3,YC3,-1
ARCTO XT1,-1*YT1,XC3,YC3,-1
ARCTO -L/2,0,XC1,YC1,-1
ENDIF`,
  },
  {
    id: 'MODEL-57', nome: 'Angoli superiori arrotondati',
    misure: { L: 'Larghezza', H: 'Altezza', R: 'Raggio degli angoli' },
    script: `VAR L=1800
VAR H=2200
VAR R=500
ENDVAR
MOVETO 0,0
LINEREL 0,H-R
ARCTO R,H,R,H-R,-1
LINEREL L-2*R,0
ARCTO L,H-R,L-R,H-R,-1
LINEREL 0,-(H-R)
LINEREL -L,0`,
  },
  {
    id: 'MODEL-58', nome: 'Angoli tutti arrotondati',
    misure: { L: 'Larghezza', H: 'Altezza', R: 'Raggio degli angoli' },
    script: `VAR L=2000
VAR H=2000
VAR R=500
ENDVAR
MOVETO 0,R
LINEREL 0,H-R-R
ARCTO R,H,R,H-R,-1
LINEREL L-2*R,0
ARCTO L,H-R,L-R,H-R,-1
LINEREL 0,-(H-R-R)
ARCTO L-R,0,L-R,R,-1
LINEREL -(L-R-R),0
ARCTO 0,R,R,R,-1`,
  },
  {
    id: 'MODEL-60', nome: 'Lunetta (arco ribassato)',
    misure: { L: 'Larghezza', H2: 'Freccia dell\'arco' },
    script: `VAR L=2500
VAR H2=500
ENDVAR
SET H = H2
SET R = (4*H2**2 + L**2) / (8*H2)
SET XC = L/2
SET YC = H-R
MOVETO 0,0
ARCTO L/2,H2,XC,YC,-1
ARCTO L,0,XC,YC,-1
LINETO 0,0`,
  },
  {
    id: 'MODEL-67', nome: 'Arco rovescio',
    misure: { L: 'Larghezza', H1: 'Altezza al centro', H2: 'Freccia dell\'arco' },
    script: `VAR L=2500
VAR H1=1800
VAR H2=500
ENDVAR
SET H = H1 + H2
SET R = (4*-H2*-H2 + L*L) / (8*-H2)
SET XC = L/2
SET YC = H1-R
MOVETO 0,0
LINETO 0,H
ARCTO L/2,H1,XC,YC,1
ARCTO L,H,XC,YC,1
LINETO L,0
LINETO 0,0`,
  },
  {
    id: 'MODEL-68', nome: 'Metà arco ribassato (chiave a destra)',
    misure: { L: 'Larghezza (metà luce)', H1: 'Altezza all\'imposta', H2: 'Freccia dell\'arco' },
    script: `VAR L=1250
VAR H1=2300
VAR H2=500
ENDVAR
SET H = H1 + H2
SET R = (4*H2**2 + (L*2)**2) / (8*H2)
SET YC = H-R
MOVETO 0,0
LINETO L,0
LINETO L,H
ARCTO 0,H1,L,YC,1
LINETO 0,0`,
  },
  {
    id: 'MODEL-69', nome: 'Metà arco ribassato (chiave a sinistra)',
    misure: { L: 'Larghezza (metà luce)', H1: 'Altezza all\'imposta', H2: 'Freccia dell\'arco' },
    script: `VAR L=1250
VAR H1=2300
VAR H2=500
ENDVAR
SET H = H1 + H2
SET R = (4*H2**2 + (L*2)**2) / (8*H2)
SET YC = H-R
MOVETO 0,0
LINETO L,0
LINETO L,H1
ARCTO 0,H,0,YC,1
LINETO 0,0`,
  },
  {
    id: 'MODEL-70', nome: 'Triangolo isoscele',
    misure: { L: 'Base', H: 'Altezza' },
    script: `VAR L=2000
VAR H=2500
ENDVAR
MOVETO 0,0
LINETO L,0
LINETO L/2,H
LINETO 0,0`,
  },
  {
    id: 'MODEL-71', nome: 'Triangolo equilatero',
    misure: { L: 'Lato' },
    script: `VAR L=2000
ENDVAR
SET H = L*SQRT(3)/2
MOVETO 0,0
LINETO L,0
LINETO L/2,H
LINETO 0,0`,
  },
]

export const modelloPerId = (id: string): ModelloForma | undefined => MODELLI.find(m => m.id === id)
