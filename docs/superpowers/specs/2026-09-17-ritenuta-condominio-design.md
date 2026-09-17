# Ritenuta 4% condomìni — la seconda ritenuta sugli incassi

Data: 2026-09-17
Stato: approvato, da implementare

## Obiettivo

Registrare sugli acconti una seconda trattenuta oltre all'11% del bonifico
parlante: la **ritenuta d'acconto del 4%** che il condominio, in quanto sostituto
d'imposta, trattiene sull'imponibile della fattura e versa all'Erario.

Come per l'11%, il cliente ha pagato tutto e non deve più niente: è in azienda
che entra meno denaro.

```
fornitura   100,00 imponibile + 22,00 IVA = 122,00 dovuti
ritenuta      4% di 100,00                =   4,00 trattenuti
il condominio bonifica                      118,00
```

## Le due ritenute a confronto

|  | Detrazioni fiscali 11% | Condomìni 4% |
|---|---|---|
| Chi trattiene | la banca, sul bonifico parlante | il condominio, come sostituto d'imposta |
| Base | imponibile scorporato **sempre al 22%** | imponibile **vero** della commessa |
| Su chi è disponibile | tutti tranne i clienti `azienda` | solo i clienti `azienda` |
| Dove finisce | credito verso l'Erario | credito verso l'Erario, indistinguibile |

La differenza sulla base è il motivo per cui non basta cambiare un'aliquota.
L'11% lo calcola la banca, che scorpora un'IVA ipotetica al 22% qualunque sia
l'aliquota della fattura. Il 4% lo calcola il commercialista del condominio
**sulla fattura vera**: su una commessa al 10% — il caso tipico dei condomìni in
ristrutturazione — 110 pagati danno imponibile 100 e ritenuta 4,00, non 3,61.

## Le due sono alternative, mai sommate

Se il pagamento arriva col bonifico parlante, il condominio non applica anche il
4%. Nell'interfaccia sono due spunte che si escludono: accendendone una si spegne
l'altra, entrambe spente = nessuna ritenuta.

## Forma dei dati: una colonna `ritenuta_tipo`

`acconti_commessa.ritenuta` resta **la cifra unica in euro**; una colonna nuova
dice di quale delle due si tratta.

```sql
ALTER TABLE acconti_commessa
  ADD COLUMN ritenuta_tipo TEXT;          -- 'detrazioni' | 'condominio' | NULL

-- coerenza: o c'è la cifra e il tipo, o non c'è né l'una né l'altro
CHECK ((ritenuta = 0 AND ritenuta_tipo IS NULL)
    OR (ritenuta > 0 AND ritenuta_tipo IN ('detrazioni','condominio')))
```

Gli acconti già marcati vengono riempiti a `'detrazioni'`: prima di oggi era
l'unica ritenuta esistente.

Scelta contro le due alternative scartate:

- **Una seconda colonna `ritenuta_condominio`** obbligherebbe a ritoccare ogni
  lettura che oggi somma `ritenuta` — flusso di cassa, card Crediti fiscali, i
  **due** blocchi `.map` della pagina statistiche. Più superfici da sbagliare, e
  siccome le due ritenute sono alternative una delle due colonne sarebbe sempre
  zero.
- **Salvare l'aliquota (0.11 / 0.04) invece del tipo** ribalterebbe la scelta 2
  del progetto esistente: l'aliquota è un numero di legge che cambia (l'11% era
  all'8% fino al 2022), il tipo di ritenuta no.

Con questa forma, **chi legge per sommare non cambia una riga**: continua a
sommare `ritenuta`. Il tipo serve solo a etichettare la riga in interfaccia e a
ricalcolare la cifra quando l'utente corregge l'importo dell'acconto.

## La formula

In `lib/ritenuta-acconto.ts`, accanto a quella esistente:

```
ALIQUOTA_RITENUTA_CONDOMINIO = 0.04
ritenuta = quotaImponibile(lordo) × 4%
```

`quotaImponibile` arriva dalla commessa come rapporto `imponibile / totale`, così
un acconto parziale scorpora con la stessa proporzione del totale.

**Fallback a ÷1,22** quando quel rapporto non è utilizzabile: commessa senza IVA
scorporata (`iva_totale = 0`, 102 righe in DB), totale a zero, rapporto fuori da
`(0, 1]`. Senza il fallback, una commessa che registra il totale IVA compresa
senza spezzarlo calcolerebbe il 4% sul lordo e gonfierebbe la trattenuta.

`nettoIncassato(lordo, ritenuta)` non cambia: vale per entrambe.

## Interfaccia

- **`SpuntaRitenuta`** diventa un selettore a tre stati: due spunte alternative,
  ciascuna col proprio motivo di blocco. L'11% resta spento sui clienti
  `azienda`; il 4% si spegne sui clienti `privato` ("non è sostituto d'imposta").
  Cliente fuori anagrafica = tipo ignoto = **entrambe disponibili**, per la
  stessa ragione di prima: meglio un caso da valutare a mano che una spunta
  sparita.
- **`RitenutaAccontoRiga`** (il comando sugli acconti già registrati, che serve ai
  pagamenti inseriti prima che la funzione esistesse) mostra i due comandi e il
  badge dice quale ritenuta è: `ritenuta 11% € 110,00` / `ritenuta 4% € 4,00`.
- **`DialogAcconto`** e **`DialogSchedaCommessa`** portano `ritenuta_tipo` nel
  form e ricevono imponibile e totale della commessa. `TabellaCommesse` li ha già:
  passa una `CommessaCompleta` intera.

## Server

- `updateAccontoRitenuta(id, ritenuta, tipo)` — aggiorna solo quei due campi, così
  non può rimescolare importo, data o firma di una ricevuta già emessa.
- `addAcconto` **normalizza** la riga prima dell'insert: ritenuta > 0 senza tipo
  diventa `'detrazioni'`, ritenuta 0 azzera il tipo. Serve agli acconti messi in
  coda offline (`db.pendingAcconti`) **prima** di questo rilascio: hanno la
  ritenuta ma non il tipo, e al ritorno in rete l'insert sbatterebbe contro il
  CHECK nuovo perdendo il pagamento in silenzio.

## Cosa NON cambia

Le cinque scelte del progetto esistente restano tutte in piedi, e il 4% le eredita:

1. Si salva **la cifra in euro**, non una spunta.
2. Cambia **un solo numero**: l'incasso di `aggregaFlussoMese`, ora netto.
   Restano al lordo saldo commessa, residuo da incassare, resoconto cliente e
   **la ricevuta al cliente** — il condominio ha bonificato 118 ma deve 122, e i
   4 trattenuti sono comunque suoi soldi versati per conto dell'azienda.
3. I crediti fiscali restano **fuori** dai crediti da incassare: un credito verso
   l'Erario si compensa, non si chiede a un cliente.
4. Nella card Crediti fiscali le due ritenute si sommano **senza distinzione**:
   sono lo stesso credito d'imposta, e separarle sarebbe una riga in più che non
   cambia nessuna decisione.
5. Le ritenute non sono inseribili a mano fra i crediti fiscali: si conterebbero
   due volte.

## Test

`lib/ritenuta-acconto.test.ts` si allunga con il caso di riferimento (122 pagati
al 22% → 4,00 trattenuti, 118 incassati), la commessa al 10% (110 → 4,00), il
fallback su commessa senza IVA scorporata, l'arrotondamento al centesimo e gli
importi non positivi.

## Trappola già scattata una volta

`app/(dashboard)/commesse/statistiche/page.tsx` seleziona le colonne degli acconti
e poi le rimappa a mano in `AccontoRow`: nel 2026-09-04 `ritenuta` era nella
select ma non nel `.map`, e ogni calcolo leggeva zero senza un errore.

Qui **non serve toccare quel file**, perché nessun calcolo legge `ritenuta_tipo` —
ed è esattamente il motivo per cui la forma dei dati è quella scelta. Se un domani
un calcolo dovesse leggerlo, i blocchi `.map` da aggiornare sono due.
