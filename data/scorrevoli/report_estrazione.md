# Report Estrazione Listino Scorrevoli COPRAL
**Fonte:** Mod. PREVENTIVO - Scorrevoli, Prisma e Kit (vers. 03.11.2025)-ALM.xlsx  
**Data estrazione:** 2026-04-11  
**Fogli analizzati:** Alpha - Alpha Plus - Maxima, Prisma, Listino Prisma, Listino, Listino_modulo  
**Foglio ignorato:** Pagina indicazioni tecniche (solo rilievo), Kit (scorrevoli) (modulo d'ordine, no prezzi strutturati)

---

## ✅ Dati estratti con successo

### A) Prezzi base €/mq
| Modello | Prezzo €/mq | Note |
|---------|-------------|------|
| Alpha | 280 | H min fatt. 1600mm, anta L 500–1100mm |
| Alpha Plus | 295 | H min fatt. 1600mm, anta L 500–1100mm |
| Maxima | 310 | H min fatt. 1600mm, anta L 500–1100mm |
| Prisma H≤1400mm | 550 | Mq min 3, anta L max 700mm |
| Prisma H 1401–2000mm | 464 | Mq min 3 |
| Prisma H 2001–3000mm | 375 | Mq min 3, H max sistema 3000mm |

### B) Configurazioni fisse (foglio Listino_modulo)
- **60 righe** estratte con successo
- Copertura: Maxima (lat. + cen., H=2600 e H=3000), Alpha Plus (lat. + cen., max 5 ante, H=2600 e H=3000), Alpha (lat. + cen., max 5 ante, H=2600 e H=3000)
- Alpha e Alpha Plus laterale: max 5 ante nel listino fisso (Maxima arriva a 7)
- Alpha e Alpha Plus centrale: max 5+5 ante (Maxima arriva a 7+7)
- Alpha ha larghezze max inferiori (2000mm per 2 ante vs 2200mm di Alpha Plus/Maxima)

### C) Colori struttura
- **11 colori standard** validi per tutti i modelli (9010, 9010OP, 1013, 1013OP, 8017, 8017OP, grigio argento, 9005, OX argento, 7016, 7016OP)
- **Differenza importante Alpha/Alpha Plus/Maxima vs Prisma:** il RAL 7016 e 7016OP sono **standard** (inclusi) per Alpha/Alpha Plus/Maxima, ma **extra +10%** per Prisma
- **Extra +10%:** 7016GRINZ, DX05, Corten, Bronze Déco (solo Alpha/Alpha Plus/Maxima)
- **Extra +30%:** effetti legno (Noce, Douglas, Rovere Sbiancato) — solo Alpha/Alpha Plus/Maxima
- **Extra +30%:** altri RAL non a catalogo (tutti i modelli, per Prisma escluse texture ruvide)
- OX Argento Sabbiato: presente in foglio Listino e Listino_modulo ma assente da Listino Prisma — considerato non applicabile a Prisma

### D) Optional/Accessori
- **22 voci** estratte
- Copertura completa di tutte le voci indicate nelle specifiche
- Chiusure supplementari Prisma (3 tipologie): estratte dal foglio Listino Prisma
- Configurazione ante Prisma in funzione della larghezza: estratta (tabella 20 fasce)

### E) Colori accessori
5 colori: Bianco, Avorio, Marrone, Nero, Grigio

### F) Parametri commerciali
Tutti estratti dai moduli preventivo (fogli Alpha e Prisma), confermati dai fogli listino.

---

## ⚠️ Ambiguità e discrepanze da verificare con fornitore

### 1. Serratura per apertura centrale — PREZZO DISCREPANTE
- Foglio **Listino**: "Serratura maniglia e contromaniglia ossidata argento per apertura centrale" → **500 €/pz**
- Foglio **Listino_modulo**: "Serratura per apertura centrale con maniglia e contromaniglia in alluminio ossidata arg." → **323 €/pz**
- **Decisione adottata:** usato **323 €/pz** (Listino_modulo è il foglio di riferimento più strutturato)
- **Azione richiesta:** confermare con COPRAL se sono lo stesso articolo o due prodotti diversi (es. serratura + maniglia separata vs kit completo)

### 2. Prezzo anonimo 320 €/pz nel foglio Listino
- Riga con solo prezzo 320 €/pz senza descrizione, coincidente con la riga del modello Maxima nel layout multi-colonna
- Potrebbe essere un optional di Maxima non identificato, oppure un artefatto del layout Excel
- **Non incluso nel JSON** in attesa di chiarimento

### 3. Prezzo anonimo 100 €/ml nel foglio Listino (riga 6)
- Riga senza descrizione con 100 €/ml — potrebbe essere la "guida incassata" (presente in Listino_modulo a 96 €/ml)
- **Decisione adottata:** usato **96 €/ml** da Listino_modulo per la guida incassata

### 4. Prezzo anonimo 60 €/pz nel foglio Listino (riga 14)
- Riga senza descrizione con 60 €/pz, subito dopo "Coppia di maniglie Pratica Colors" (100 €/pz)
- Potrebbe essere: una variante di colore, un singolo manico, o un articolo correlato
- **Non incluso nel JSON** — da chiarire con COPRAL

### 5. Profilo "L": misura 50×20 vs 50×30
- Foglio **Listino**: indica "Profilo ad L 50*20"
- Foglio **Listino_modulo**: indica "Profilo ad L 50*30"
- **Decisione adottata:** usato **50×30** (Listino_modulo più recente/specifico)
- **Azione richiesta:** verificare la misura corretta del profilo con il fornitore

### 6. Stray values nel foglio Listino_modulo
- Alcune celle contengono valori numerici isolati (es. 3400, 2700, 8, 8, 4500, 2900) non attribuibili a nessuna riga di configurazione strutturata
- Probabilmente residui di calcoli o note del compilatore Excel
- **Ignorati nell'estrazione**

### 7. Serratura laterale: foglio Listino riporta 334 ✓ — confermato da Listino_modulo. Nessuna discrepanza.

### 8. Alpha Plus laterale e centrale: solo H=2600 e H=3000 nel Listino_modulo
- Non ci sono configurazioni per H intermedie (es. 2800) — la tabella fissa copre solo questi due punti altezza
- Eventuali altezze diverse andrebbero calcolate via €/mq

---

## 📋 Note per integrazione in Win Studio (Gestionale Infissi)

### Struttura listino suggerita
Il listino scorrevoli va implementato come **Listino Libero** (tipo=libero) nella categoria "Scorrevoli / Vetrate Panoramiche", con prodotti distinti per modello.

**Due modalità di prezzo coesistono:**
1. **€/mq** (con fasce altezza per Prisma, H min fatturazione, mq minimi) — per configurazioni su misura
2. **Prezzo fisso per configurazione** (dal Listino_modulo) — per le combinazioni standard tabellate

**Schema dati consigliato per Win Studio:**
```
Categoria: Scorrevoli Panoramici COPRAL
└─ Prodotto: Alpha (€/mq = 280, parametri: H_min_fatt, anta_L_min/max)
└─ Prodotto: Alpha Plus (€/mq = 295)
└─ Prodotto: Maxima (€/mq = 310)
└─ Prodotto: Prisma (€/mq = variabile, fascia per H)
└─ Accessori: [tutti gli optional come AccessorioGriglia]
```

**Colori:** implementabili come maggiorazione percentuale sull'importo base (già supportato da `calcolaAccessorioGriglia` con tipo_prezzo='percentuale').

**Parametri commerciali editabili per commessa:**
- Sconto vetrata Prisma (default 50%)
- Sconto optional (default 45%)
- Trasporto (default 4%)
- Margine ALM (da aggiungere, non presente nel listino fornitore)
- IVA (default 22%)

**Configurazioni fisse:** utilizzabili come lookup-table alternativo alla formula €/mq. Suggerimento: implementare come `griglia[nr_ante][larghezza_max]` con campo altezza_max per distinguere H=2600 da H=3000.

### Vincoli tecnici da rispettare
- Prisma: mq minimi 3, H min fatturazione 1400mm, anta L max 700mm, H max 3000mm
- Alpha/Alpha Plus/Maxima: H min fatturazione 1600mm, anta L 500–1100mm
- Vetro standard Prisma: 8mm se H≤1800mm, 10mm se H>1800mm
- Prisma: escluse verniciature texture ruvida (nessun effetto legno, nessun RAL con texture)
- Sgancio anta Prisma: il primo ogni 7 ante è incluso nel prezzo vetrata; quelli aggiuntivi sono optional a 75 €/pz
- Tempi consegna: 2 settimane da perfezionamento ordine (standard)
- Pagamento fornitore: 50% all'ordine, saldo ad avviso merce pronta

### File generati
| File | Percorso | Contenuto |
|------|----------|-----------|
| scorrevoli_listino.json | data/scorrevoli/ | JSON strutturato completo |
| scorrevoli_listino.csv | data/scorrevoli/ | Tabella flat separatore `;` |
| report_estrazione.md | data/scorrevoli/ | Questo file |
