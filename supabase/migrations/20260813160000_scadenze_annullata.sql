-- Scadenze annullate: la riga resta con tutti i suoi dati (foto, contabile,
-- rata) ma esce da ogni totale. Serve quando una scadenza non viene pagata
-- perche' sostituita da un'altra.
alter table public.scadenze
  add column if not exists annullata boolean not null default false;

-- I totali e lo slot Calcoli filtrano sempre le annullate
create index if not exists scadenze_annullata_idx
  on public.scadenze (organization_id, annullata);
