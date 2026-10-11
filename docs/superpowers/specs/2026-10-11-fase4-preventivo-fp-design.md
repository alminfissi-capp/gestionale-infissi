# Fase 4 — Dal rilievo al preventivo con i conti di FP PRO

Documento di progetto, 2026-10-11. Approvato in chat. Dettaglia la Fase 4 di `2026-10-10-rilievo-preventivo-fppro-design.md` (§7, §8, §12).

## 1. Obiettivo

Un rilievo fatto con le strutture di FP PRO diventa, in ufficio, un **preventivo nella sezione Preventivi** con prezzi calcolati **come li calcola FP PRO**, senza riscrivere nulla.

**Riuscito quando:**
- il prezzo di una voce segue la formula di FP PRO (verificata al centesimo su 170-26G e 172-26G);
- il costo dei materiali stimato da WinStudio sta **entro il 5%** di quello calcolato da FP PRO sulle stesse commesse;
- le righe nel preventivo sono **uguali a quelle create da "Importa PDF costi FP-PRO"** (immagine, descrizione con misure, note tecniche, prezzo, costo materiali, costo lavorazione + posa).

## 2. Scelte fatte con l'utente (2026-10-11)

| Tema | Scelta |
|---|---|
| Modello di prezzo | **Come FP PRO**: ore × €/h per lavorazione, spese generali %, utile %, provvigione, spese varie % e fisse |
| Parametri | **Profili di calcolo di FP PRO** (ALM2026, PRODOTTO FINITO 2026, …) sincronizzati, scelti per rilievo, **correggibili per riga** (ore, percentuali, extra fissi) |
| Origine | **Dal rilievo** ("Trasferisci in Preventivi") **e a mano dentro un preventivo** ("Aggiungi da FP PRO") |
| Aspetto | Quello delle righe importate da FP PRO in Preventivi; nessun PDF nuovo |
| Precisione | Stima dei materiali entro il 5%, verificata su commesse vere; il calcolo di produzione resta di FP PRO |

## 3. La formula di FP PRO (verificata)

Per una voce (tutti gli importi per una struttura, poi × quantità):

```
costo puro        = materiali + Σ ore(taglio, lavorazione, montaggio, assemblaggio, posa) × €/h del profilo
costo industriale = costo puro × (1 + spese generali)
A                 = costo industriale × (1 + utile)
B                 = A ÷ (1 − provvigione)                 (la provvigione e' sul prezzo di vendita)
imponibile        = B × (1 + imballo + viaggio + materiali vari + altro) + extra fissi
```

Verifica: 170-26G → materiali 1.231,86 + 4 h × 30 + 1 h × 50 = 1.401,86; ×1,02 = 1.429,90; ×1,30 = 1.858,87; ÷0,95 = 1.956,71; ×1,04 = **2.034,97** ✓. 172-26G → 1.656,82; ×1,03; ×1,25; ÷1; ×1,01 + 230 = **2.384,48** ✓.

Le **ore** sono quelle della struttura (`FP_TIMES`: CuttingTime, MachiningTime, MountingTime, CompositionTime, PlacingTime).

## 4. I materiali (stima)

- **Profili a barre intere**, come FP PRO: si ricavano i pezzi (codice, lunghezza) dalla geometria della struttura alle misure del rilievo, si sistemano nelle barre (lunghezza da `barlen`, 6.500 mm di solito) con il criterio "il più lungo per primo", e si paga **ogni barra usata**: barre × lunghezza × kg/m × 1,03 × €/kg del colore (oppure × €/m). Verificato: 170-26G profili 707,33 € = somma delle barre intere.
- **Ottimizzazione dei tagli come FP PRO** (richiesta dell'utente 2026-10-11): stessi dati di FP PRO — lunghezza barra per profilo (`barlen`), scarto di testa e coda per codice (`serie_profili_scarti`, di solito 30 + 30 mm), spessore lama per taglio; i profili composti (`profilicomponenti`, es. TT8002B = TT8002 + 2 × TAC807) si scompongono nei componenti, ognuno ottimizzato sulle sue barre. L'ottimizzatore di FP PRO è chiuso: si usa lo stesso metodo ("il più lungo per primo") e si verifica sulle commesse vere che il numero di barre torni.
- **Geometria dei pezzi:** telaio dai lati (L, H); traversi e montanti dalle zone che dividono; ante dalla zona che occupano divisa per il numero di ante; fermavetri, fermapannelli, zoccoli, fasce e soglie dalla loro zona; larghezze dei profili stimate dai poligoni della struttura.
- **Accessori:** regole dei kit e degli accessori scelti (quantità fissa; a fasce su H/L/formula; a passo; a metro su H, L o perimetro con la maggiorazione di FP PRO); prezzo = prezzo ÷ unità di vendita × quantità.
- **Vetri e pannelli:** dimensioni del campo, m² × €/m², minimo fatturabile se previsto dal vetro.

La stima si verifica con test sulle due commesse vere (file della commessa in `__fixtures__`, risultati di FP PRO come attesi).

## 5. Dati nuovi

- Sincronizzate dal ponte: `fp_config_prev` (profili di calcolo), `fp_barre` (lunghezze barra per profilo), `fp_pannelli` (prezzi pannelli); `fp_strutture.tempi` (ore della struttura; il ponte rilegge le strutture già copiate una volta).
- `rilievi_veloci.config_prev_fp_id` (profilo scelto) e, nella voce, `fp.correzioni` (ore, percentuali, extra fissi).
- `articoli_preventivo.config_fppro` (jsonb): voce, struttura, calcolo; serve alla fase 5. La riga resta di tipo `libera` (stesso aspetto e stessi conti delle righe importate).

## 6. Interfaccia

1. **Rilievo → "Calcolo"** (in ufficio, con rete): profilo di calcolo; per ogni voce materiali, ore, prezzo unitario e totale, con le correzioni; totale del rilievo; **"Trasferisci in Preventivi"** crea un preventivo nuovo per il cliente del rilievo e lo apre.
2. **Preventivo → "Aggiungi da FP PRO"**: serie → tipologia → misure → finitura → vetri → opzioni → profilo di calcolo, crea la stessa riga.

## 7. Divisione del lavoro

- **Fase 4a:** sincronizzazioni nuove, motore di calcolo verificato, vista Calcolo nel rilievo, trasferimento in Preventivi.
- **Fase 4b:** "Aggiungi da FP PRO" dentro il preventivo.

## 8. Rischi

| Rischio | Cosa si fa |
|---|---|
| Stima dei profili oltre il 5% su strutture particolari (una barra in più o in meno pesa) | test sulle commesse vere; correzione manuale per riga; la riga mostra "stima" |
| Regole degli accessori di FP PRO non documentate | ricavate dai risultati di FP PRO sulle commesse vere; accessori a regola ignota contati 1 e segnalati |
| Prezzi mancanti (vetri senza prezzo, profili senza costo per quel colore) | avviso sulla voce, importo 0 evidenziato, si corregge a mano |
| Profilo di calcolo cambiato in FP PRO dopo il preventivo | la riga conserva i numeri usati (fotografia), come per le righe importate |
