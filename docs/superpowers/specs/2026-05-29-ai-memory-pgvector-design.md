# PRD — Assistente AI con Memoria Semantica (pgvector)

**Data:** 2026-05-29
**Stato:** Pianificato — implementazione futura
**Priorità:** Alta (prerequisito per AI di produzione)

---

## 1. Visione

L'assistente AI di Win Studio deve crescere con l'azienda. Ogni conversazione, ogni fatto appreso, ogni pattern operativo deve diventare conoscenza permanente accessibile nelle sessioni future. L'obiettivo finale è un AI operativo che conosce il business, impara dai dati storici e produce consigli concreti su scheduling, gestione magazzino e produzione.

---

## 2. Stato attuale

- Assistente AI con `gpt-4o-mini` via OpenRouter
- Tool di lettura: clienti (con search), preventivi, commesse (da aggiungere)
- Nessuna persistenza tra sessioni — ogni conversazione riparte da zero
- Nessuna conoscenza accumulata sul business

---

## 3. Obiettivi

### 3.1 Memoria condivisa per organizzazione
- Fatti e conversazioni condivisi tra tutti gli operatori dell'org
- L'AI non deve mai "dimenticare" qualcosa che ha già imparato
- Futura granularità per ruolo utente (operaio, admin, ecc.)

### 3.2 Auto-addestramento passivo
- L'AI salva automaticamente fatti rilevanti mentre risponde
- Riassume le conversazioni significative a fine sessione
- Costruisce un knowledge graph del business nel tempo

### 3.3 Retrieval semantico
- Non keyword matching, ma ricerca per significato
- "Chi è il cliente difficile?" trova fatti salvati come "Rossi paga sempre in ritardo"
- Resiliente a variazioni di formulazione

### 3.4 Base per AI di produzione (futuro)
- Stima ore lavoro per tipo commessa
- Analisi tempi storici per lavorazione
- Consigli cronoprogramma e giorni di posa
- Alert magazzino basati su consumi storici

---

## 4. Architettura

```
[Utente] → [AISidebar]
               ↓
         [POST /api/assistant]
               ↓
    ┌──────────────────────────┐
    │  1. Genera embedding     │  ← OpenAI text-embedding-3-small
    │     della query utente   │
    └──────────┬───────────────┘
               ↓
    ┌──────────────────────────┐
    │  2. Cerca memorie        │  ← Supabase pgvector
    │     semanticamente vicine│    cosine similarity, top-K
    └──────────┬───────────────┘
               ↓
    ┌──────────────────────────┐
    │  3. Inietta nel prompt   │  ← System prompt arricchito
    │     memorie rilevanti    │
    └──────────┬───────────────┘
               ↓
    ┌──────────────────────────┐
    │  4. gpt-4o-mini risponde │  ← Tool calls + risposta
    │     con tool calls       │
    └──────────┬───────────────┘
               ↓
    ┌──────────────────────────┐
    │  5. AI salva nuovi fatti │  ← Tool salva_fatto
    │     se li ha appresi     │
    └──────────────────────────┘
```

---

## 5. Schema Database

### Tabella `ai_memoria`

```sql
create extension if not exists vector;

create table ai_memoria (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tipo          text not null check (tipo in ('fatto', 'conversazione', 'procedura', 'alert')),
  titolo        text not null,
  contenuto     text not null,
  tags          text[] default '{}',
  embedding     vector(1536),          -- text-embedding-3-small
  importanza    smallint default 3     -- 1=bassa, 3=normale, 5=critica
    check (importanza between 1 and 5),
  accessi       integer default 0,     -- quante volte è stata recuperata
  ultima_modifica timestamptz default now(),
  created_at    timestamptz default now(),
  created_by    uuid references auth.users(id)
);

-- Indice per ricerca vettoriale (cosine similarity)
create index ai_memoria_embedding_idx
  on ai_memoria
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Indice per filtrare per org (sempre presente nelle query)
create index ai_memoria_org_idx on ai_memoria(organization_id);

-- RLS
alter table ai_memoria enable row level security;

create policy "org members can read own memories"
  on ai_memoria for select
  using (organization_id = get_org_id());

create policy "org members can insert memories"
  on ai_memoria for insert
  with check (organization_id = get_org_id());

create policy "org members can update memories"
  on ai_memoria for update
  using (organization_id = get_org_id());
```

### Funzione di ricerca semantica

```sql
create or replace function cerca_memorie_simili(
  org_id      uuid,
  query_embedding vector(1536),
  match_count int default 8,
  min_similarity float default 0.3
)
returns table (
  id uuid, tipo text, titolo text, contenuto text,
  tags text[], importanza smallint, similarity float
)
language sql stable
as $$
  select
    id, tipo, titolo, contenuto, tags, importanza,
    1 - (embedding <=> query_embedding) as similarity
  from ai_memoria
  where organization_id = org_id
    and 1 - (embedding <=> query_embedding) > min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

---

## 6. Tool AI

### Tool di lettura memoria

```typescript
cerca_memoria: tool({
  description: 'Cerca nella memoria aziendale fatti, procedure e conversazioni passate rilevanti per la domanda corrente.',
  parameters: z.object({
    query: z.string().describe('Cosa stai cercando di ricordare o capire'),
  }),
  execute: async ({ query }) => {
    // 1. Genera embedding della query
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    // 2. Cerca in Supabase
    const { data } = await supabase.rpc('cerca_memorie_simili', {
      org_id: orgId,
      query_embedding: embedding.data[0].embedding,
      match_count: 8,
    })
    return { memorie: data ?? [] }
  },
})
```

### Tool di scrittura memoria

```typescript
salva_fatto: tool({
  description: 'Salva un fatto, una preferenza cliente, una procedura o un\'informazione importante da ricordare per il futuro.',
  parameters: z.object({
    tipo: z.enum(['fatto', 'procedura', 'alert']),
    titolo: z.string().describe('Titolo breve e descrittivo'),
    contenuto: z.string().describe('Contenuto completo del fatto da ricordare'),
    tags: z.array(z.string()).optional().describe('Tag per categorizzare (es. ["cliente:Rossi", "magazzino"])'),
    importanza: z.number().min(1).max(5).optional().default(3),
  }),
  execute: async ({ tipo, titolo, contenuto, tags, importanza }) => {
    // Genera embedding e salva
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: `${titolo}\n${contenuto}`,
    })
    const { error } = await supabase.from('ai_memoria').insert({
      organization_id: orgId,
      tipo, titolo, contenuto,
      tags: tags ?? [],
      embedding: embedding.data[0].embedding,
      importanza,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  },
})
```

### Tool di aggiornamento memoria

```typescript
aggiorna_fatto: tool({
  description: 'Aggiorna o corregge un fatto già memorizzato se l\'utente fornisce nuove informazioni.',
  parameters: z.object({
    id: z.string().describe('ID della memoria da aggiornare'),
    contenuto: z.string().describe('Nuovo contenuto'),
  }),
  execute: async ({ id, contenuto }) => {
    // Rigenera embedding e aggiorna
    ...
  },
})
```

---

## 7. Iniezione Automatica nel System Prompt

All'inizio di ogni richiesta, prima di passare al modello:

```typescript
// 1. Embedding della prima domanda utente
const lastUserMessage = messages.filter(m => m.role === 'user').at(-1)?.content
const queryEmbedding = await generateEmbedding(lastUserMessage)

// 2. Recupera memorie rilevanti
const memorie = await cercaMemorie(orgId, queryEmbedding)

// 3. Inietta nel system prompt
const memorieSection = memorie.length > 0
  ? `\nMEMORIE RILEVANTI DAL DATABASE AZIENDALE:\n${memorie.map(m =>
      `[${m.tipo.toUpperCase()}] ${m.titolo}: ${m.contenuto}`
    ).join('\n')}`
  : ''

system = baseSystemPrompt + memorieSection
```

---

## 8. Tipi di Memoria

| Tipo | Esempi | Salvato da |
|------|--------|-----------|
| `fatto` | "Cliente Rossi preferisce alluminio taglio termico", "Il fornitore Vetri Italia ha 30gg pagamento" | AI automaticamente o utente |
| `procedura` | "Per commesse ferro, controllare sempre lo spessore lamiera in magazzino prima di confermare" | Utente esplicitamente |
| `conversazione` | Riassunto di sessioni significative | AI automaticamente a fine sessione |
| `alert` | "Cliente Bianchi ha saldo scaduto da 60gg", "Profilo 70mm in esaurimento" | AI da analisi dati |

---

## 9. Flusso di Auto-Addestramento

```
Sessione conversazione
        ↓
AI risponde con tool calls (legge DB, risponde)
        ↓
Durante la sessione:
  - Impara fatto nuovo → chiama salva_fatto() automaticamente
  - Aggiorna fatto sbagliato → chiama aggiorna_fatto()
        ↓
Fine sessione (da implementare):
  - API cron o webhook che riassume la conversazione
  - Salva riassunto come memoria tipo 'conversazione'
```

---

## 10. Estensione Futura — AI di Produzione

Quando sarà implementato il modulo produzione, la memoria permetterà:

- **Stima ore**: "Per una commessa con 8 finestre alluminio taglio termico, storicamente impieghiamo X ore"
- **Alert magazzino**: "Il profilo 70mm finisce tra 12gg al ritmo attuale"
- **Ottimizzazione posa**: "Quando piove, sposta le pose in esterno di 2gg"
- **Analisi ritardi**: "Le commesse ferro sistematicamente slittano di 3gg — causa: lavorazione esterna"

Questi insight nascono dall'accumulo di dati di produzione nella tabella `ai_memoria` + analisi sui dati operativi del DB.

---

## 11. Permessi Futuri (per ruolo)

```typescript
// Future implementation
const memorieVisibili = filterByRole(memorie, userRole)
// operaio → no dati finanziari, no margini
// commerciale → no costi produzione interni
// admin → tutto
```

---

## 12. Stack Tecnico

| Componente | Tecnologia |
|-----------|-----------|
| Embeddings | `text-embedding-3-small` (OpenAI via OpenRouter) — 1536 dimensioni, $0.02/1M token |
| Vector store | Supabase pgvector (già incluso nel piano) |
| Ricerca | `ivfflat` cosine similarity — ottimo fino a ~1M vettori |
| Modello AI | `openai/gpt-4o-mini` via OpenRouter |
| Caching embedding | Redis/Upstash (futuro, se volumi alti) |

---

## 13. Dipendenze da Implementare Prima

1. Migrare a Supabase pgvector (abilitare estensione)
2. Creare tabella `ai_memoria` + funzione `cerca_memorie_simili`
3. Aggiungere `OPENAI_API_KEY` (o usare `WINSTUDIO` per embeddings via OpenRouter)
4. Aggiornare route `/api/assistant` con nuovi tool
5. Espandere tool di lettura a tutti i moduli (commesse, magazzino, listini)

---

## 14. Metriche di Successo

- L'AI risponde correttamente a domande su fatti appresi in sessioni precedenti
- I fatti salvati crescono nel tempo senza degradare la qualità delle risposte
- Tempo di risposta < 3s nonostante il retrieval vettoriale
- L'utente non deve mai rispiegare lo stesso fatto due volte
