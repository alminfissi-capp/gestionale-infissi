# Opzioni semplici della voce (rilievo FP PRO) — design

Data: 2026-10-25. Stato: da approvare.

## Perche'

Il configuratore dovra' usarlo anche un rivenditore. Oggi la voce mostra tutti i kit opzionali di FP PRO
come caselle libere, gli accessori facoltativi dei kit come caselle libere e ~400 colori accessori. Effetti
reali:

- caso Agrusa / 183-26G: due kit alternativi spuntati insieme (2AR-SORMONTO + 2AR-SCOMPARSA) → ferramenta
  doppia, +5% sul preventivo;
- colori accessori che nessun accessorio della voce ha → prezzo dell'accessorio non trovato (zero o "il piu'
  alto" con avviso);
- kit con nome in maiuscolo nello STR e minuscolo nel catalogo (es. `F2-DK-DX` / `F2-dk-dx`, ferramenta GU del
  PVC) → WinStudio non trova righe ne' gruppo: accessori mancanti.

Obiettivo (parole dell'utente): scelte chiare per l'operatore, niente doppioni, niente mancanze, il resto lo
configura il sistema. Calcolo efficiente per il preventivo.

## Non obiettivi

- Non si cambia il motore di calcolo (formule, barre, regole kit): cambia solo COME si arriva a `fp.kit` e
  `fp.accessori`, che restano il formato salvato.
- Non si scrive niente in FP PRO (regola fissa: solo lettura).
- Non si correggono d'ufficio le voci gia' salvate: si mostrano gli avvisi, l'utente sistema.

## Cosa vede l'operatore

Pannello "Opzioni" della voce (sostituisce "Accessori"), dall'alto:

1. **Domande**: una per gruppo di alternative presente nella struttura, con un nome pulito.
   - Gruppo di cerniere/ferramenta (kit del gruppo che si dividono in "a scomparsa" e "a vista", vedi sotto):
     due pulsanti **A vista** / **A scomparsa**. La variante tecnica (complanare/sormonto/ristrutturazione, DX/SX)
     la sceglie il sistema.
   - Altri gruppi "scegli uno" (es. Maniglia, Telaio, Chiusura): elenco a scelta unica, predefinito = quello
     confermato nella struttura.
   - Gruppi "facoltativo": scelta unica con "Nessuno".
   - Gruppi "anche piu' di uno": caselle.
   - Sotto la scelta, gli **accessori facoltativi** del kit scelto, raggruppati allo stesso modo (es. martellina
     Aurora / martellina con vaschetta = scelta unica; serratura e borchia = caselle se il gruppo e' multiplo).
2. **Altre opzioni**: kit facoltativi senza gruppo che sono vere aggiunte (es. ASTA DI CHIUSURA, scontri per
   serratura elettrica): caselle si'/no.
3. **Accessori aggiunti** (gia' esistente: MEDISYSTEM ecc.).
4. **Avanzate** (chiuso, lo apre chiunque): l'elenco completo di oggi, kit e accessori facoltativi uno per uno.
   Le scelte fatte qui restano; se rompono una regola (due alternative insieme) compare l'avviso.

Colori accessori: vedi sezione dedicata.

## Regole (le decide il sistema)

### Gruppi di alternative
- Fonte: FP PRO `fp_kit.dati.raggruppamentoid` → tabella MySQL `gruppiopzkit` (`descrizione`, `grptype`:
  0 = scegli uno, 1 = facoltativo, 2 = piu' di uno). Il ponte la copia (nuova tabella `fp_kit_gruppi`,
  ponte 1.7.0). Il confronto kit STR ↔ catalogo e' **senza maiuscole/minuscole**; se lo stesso nome ha piu'
  righe (gruppi kit diversi, es. POOLFILE 34/35/36) vale il primo raggruppamento non nullo.
- Gruppo valido per un nodo solo se nel nodo ci sono >= 2 kit facoltativi di quel gruppo; con un solo kit il
  gruppo non e' una domanda (kit trattato come senza gruppo).
- Nome pulito della domanda: dalla descrizione del gruppo si tolgono prefissi tipo `1B -`, `2A -`, `1 -`,
  `SCELTA`, `TIPO`; maiuscola iniziale. Se il gruppo e' di cerniere (regola sotto) il nome e' "Cerniere".

### Kit senza gruppo (dopo il confronto senza maiuscole)
- **Kit base**: facoltativo, confermato nella struttura e unico della sua famiglia nel nodo → sempre attivo,
  visibile solo in Avanzate (es. FIX_TEL, BATTENTE generico, PLANET TEL01, COLOMBO DESIGN).
- **Famiglie dal nome** (solo per i kit senza gruppo FP PRO): SERR → Serratura; CERN, PIVOT → Cerniere;
  MANIGL, MARTELL, CREMON, EXENS → Maniglia; `\b\d ANT[AE]\b` → Tipo anta. Se nel nodo ci sono >= 2 kit della
  stessa famiglia → gruppo sintetico "scegli uno" (caso Easy Door: tipo anta, cerniere normali/pivot,
  serratura patent/cilindro/libero-occupato).
- Il resto → "Altre opzioni" (caselle).

### A vista / a scomparsa
- Un gruppo e' "di cerniere" se tra i suoi kit nel nodo ce ne sono con `SCOMPARSA`, `SCF` o `SECRET` nel nome
  E altri senza. Famiglia del kit = "a scomparsa" se il nome contiene una di quelle parole, altrimenti "a vista".
- Variante scelta dal sistema dentro la famiglia, in ordine:
  1. il kit confermato nella struttura, se e' della famiglia;
  2. se i kit della famiglia differiscono per DX/SX (nome con `-DX`/`-SX` o ` DX`/` SX`): quello della mano della
     voce (`fp.mano`); senza mano, quello del lato del kit confermato, altrimenti DX;
  3. a parita': stesso "suffisso" del confermato (es. `-DS`, `-RISTRUTT`, `-7.5`), poi il primo in ordine STR.
- Cambiando la mano della voce, la variante DX/SX si riallinea.

### Accessori facoltativi dentro i kit
- Gruppo dell'accessorio = `gruppoid` della riga del catalogo del kit (`fp_kit_righe.dati.gruppoid`), anche per le
  righe dello STR (si abbinano per kit + codice). Tipo del gruppo da `fp_kit_gruppi.grptype`.
- Stesso schema delle domande: scegli uno / facoltativo con "Nessuno" / caselle. Senza gruppo → casella.
- Predefinito come oggi (STR: confermato; catalogo: primo del gruppo).
- Verificato sullo scorrevole SLIDE 80: `gruppoid` 72 "SCELTA TIPO MANIGLIONE" (grptype 0: martellina Aurora o
  martellina+vaschetta), 9 "SCELTA SERRATURA" (grptype 2: serratura e borchia supplementare insieme), 46 "SCELTA
  TIPO VASCHETTA AD INCASSO" (grptype 1: vaschetta normale o con chiave, o nessuna). Stessa numerazione dei
  gruppi di kit.
- Kit non presente nel catalogo (es. COLOMBO DESIGN): i suoi accessori facoltativi restano caselle.

### Salvataggio
- Ogni scelta della UI scrive `fp.kit` per TUTTI i kit del gruppo (uno `true`, gli altri `false`) e `fp.accessori`
  per gli accessori del gruppo. Il calcolo resta quello di oggi.
- `kitAlternativiDoppi` (gia' esistente) usa anche i gruppi sintetici; avviso in voce e nel Calcolo.

## Colori accessori

- **Accessori che dipendono dal colore** = quelli con righe in `fp_accessori_costi` (prezzo > 0). Sulla PLANET
  2 ante sono 6 su 80.
- Il server mette nell'albero per il telefono, per ogni kit e per il nodo, i codici dei suoi accessori che
  dipendono dal colore (`codiciColore`). Nuova tabella di catalogo al telefono `fpAccessoriColori`
  (codice → id colori con prezzo), dalla vista `fp_accessori_colori`.
- L'elenco dei colori accessori della voce mostra solo i colori che hanno prezzo per almeno uno degli accessori
  a colore dei kit ATTIVI, ordinati per quanti ne coprono, con "copre N di M". In testa quelli che li coprono tutti.
- Se l'elenco scelto lascia scoperto un accessorio a colore: avviso nella voce ("ACP 50239 non esiste in AV, NO:
  aggiungi un colore") — oggi lo si scopre solo nel Calcolo.
- Voce senza accessori a colore: il campo si nasconde ("Gli accessori di questa voce hanno un prezzo unico").
- Il calcolo non cambia (primo colore che ha il prezzo, poi prezzo generale, poi il piu' alto con avviso).

## Calcolo (server)

- Kit dal catalogo per nome senza maiuscole: si legge tutto `fp_kit` (≈1.000 righe) e si abbina in memoria
  (`.in('nome')` di PostgREST distingue le maiuscole). Le righe dei kit (`fp_kit_righe`) si leggono per id.
- Avviso doppioni come oggi, con i gruppi sintetici.

## Telefono / sincronizzazione

- Dexie v12: riscarica le strutture (albero con gruppi, famiglie, codici a colore) + nuove tabelle
  `fpKitGruppi` (piccola) e `fpAccessoriColori`. Si azzera solo il cursore delle strutture (gli elenchi restano
  offline).
- Ponte 1.7.0: copia `gruppiopzkit` → `fp_kit_gruppi`; reinstallare con `ponte/installa.ps1`.
- Tutto il calcolo delle domande (gruppi, famiglie, varianti) e' una funzione pura in `lib/fppro/` usata dal
  telefono; il server prepara solo i dati (gruppi, `gruppoid` degli accessori, `codiciColore`).

## Lasciato a chi costruisce

- Testi esatti delle etichette e ordine delle domande (consiglio: cerniere, maniglia, poi il resto).
- Aspetto dei controlli (pulsanti per 2 scelte, menu a tendina oltre 4).
- Test: funzioni pure con i casi veri (PLANET 2AR Agrusa, slide 80 serrature/martelline, Easy Door, GU F2-DK
  DX/SX con scomparsa) e calcolo invariato a parita' di `fp.kit`.

## Scelte prese da Claude (l'utente ha delegato: "fai tu")

- Gruppi sintetici dai nomi per i kit senza gruppo (invece di chiedere di sistemare FP PRO).
- Kit base nascosti in Avanzate; "Altre opzioni" per le aggiunte senza famiglia.
- Variante a vista/scomparsa: confermato → mano → suffisso → primo.
- Colori: filtro sugli accessori a colore dei kit attivi, con copertura.
