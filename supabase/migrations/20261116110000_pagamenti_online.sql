-- ============================================================
-- 20261116110000_pagamenti_online.sql
-- Pagamenti online dei preventivi (Stripe Checkout), dal modulo alm-pagamenti (001_pagamenti_online.sql),
-- piu' i metodi carta/rate negli acconti e il legame acconto -> pagamento (un solo acconto per pagamento).
-- Spec: docs/superpowers/specs/2026-11-15-pagamenti-online-design.md
-- ============================================================

-- 1) Pagamenti online: una riga per ogni checkout aperto (pagato o no)
create table if not exists public.pagamenti_online (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  preventivo_id         uuid not null references public.preventivi(id) on delete cascade,
  tipo                  text not null check (tipo in ('acconto', 'saldo')),
  importo               numeric(12, 2) not null check (importo > 0),
  valuta                text not null default 'eur',
  stato                 text not null default 'creato'
                        check (stato in ('creato', 'in_attesa', 'pagato', 'fallito', 'scaduto', 'annullato', 'rimborsato')),
  metodo                text,                -- card, klarna, scalapay, paypal, satispay...
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  acconto_commessa_id   uuid references public.acconti_commessa(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  pagato_at             timestamptz
);

create index if not exists pagamenti_online_preventivo_idx on public.pagamenti_online (preventivo_id);
create index if not exists pagamenti_online_pi_idx on public.pagamenti_online (stripe_payment_intent);
create index if not exists pagamenti_online_org_created_idx on public.pagamenti_online (organization_id, created_at desc);

comment on table public.pagamenti_online is
  'Modulo alm-pagamenti: checkout Stripe dei preventivi. Scritta solo dal server del modulo (service role).';

-- 2) Scelte dell'operatore per singolo preventivo (pannello "Pagamento online" nell'ultima pagina).
--    Se la riga non esiste il pagamento online è DISATTIVO.
create table if not exists public.pagamenti_impostazioni_preventivo (
  preventivo_id          uuid primary key references public.preventivi(id) on delete cascade,
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  abilitato              boolean not null default false,  -- l'operatore ha attivato il pagamento online
  modalita               text not null default 'percentuale' check (modalita in ('percentuale', 'totale')),
  acconto_percentuale    numeric(5, 2) check (acconto_percentuale is null or (acconto_percentuale > 0 and acconto_percentuale < 100)),
  rate_abilitate         boolean not null default true,   -- Klarna / Scalapay / Alma
  saldo_online           boolean not null default true,   -- dopo l'acconto, saldo pagabile online
  con_detrazione_fiscale boolean not null default false,  -- blocco di sicurezza (serve bonifico parlante)
  importo_personalizzato numeric(12, 2) check (importo_personalizzato is null or importo_personalizzato > 0),
  updated_at             timestamptz not null default now()
);

comment on table public.pagamenti_impostazioni_preventivo is
  'Modulo alm-pagamenti: scelte operatore per preventivo (attivazione, percentuale o totale, rate, saldo online).';

-- 3) RLS: gli utenti di Win Studio vedono solo i dati della propria organizzazione,
--    stesso schema delle altre tabelle (get_user_organization_id()).
--    Il modulo scrive con la service role, che ignora la RLS. Nessun accesso anonimo.
alter table public.pagamenti_online enable row level security;
alter table public.pagamenti_impostazioni_preventivo enable row level security;

drop policy if exists pagamenti_online_select on public.pagamenti_online;
create policy pagamenti_online_select on public.pagamenti_online
  for select using (organization_id = get_user_organization_id());

drop policy if exists pag_imp_select on public.pagamenti_impostazioni_preventivo;
create policy pag_imp_select on public.pagamenti_impostazioni_preventivo
  for select using (organization_id = get_user_organization_id());
drop policy if exists pag_imp_insert on public.pagamenti_impostazioni_preventivo;
create policy pag_imp_insert on public.pagamenti_impostazioni_preventivo
  for insert with check (organization_id = get_user_organization_id());
drop policy if exists pag_imp_update on public.pagamenti_impostazioni_preventivo;
create policy pag_imp_update on public.pagamenti_impostazioni_preventivo
  for update using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());
drop policy if exists pag_imp_delete on public.pagamenti_impostazioni_preventivo;
create policy pag_imp_delete on public.pagamenti_impostazioni_preventivo
  for delete using (organization_id = get_user_organization_id());

-- 4) Vista comoda per Win Studio: situazione pagamenti per preventivo
create or replace view public.v_pagamenti_preventivo
with (security_invoker = true) as
select
  p.id                                                     as preventivo_id,
  p.organization_id,
  p.numero,
  p.totale_finale,
  coalesce(sum(po.importo) filter (where po.stato = 'pagato'), 0)  as pagato_online,
  p.totale_finale - coalesce(sum(po.importo) filter (where po.stato = 'pagato'), 0) as residuo,
  max(po.pagato_at)                                        as ultimo_pagamento_at,
  bool_or(po.stato = 'in_attesa')                          as pagamento_in_conferma
from public.preventivi p
join public.pagamenti_online po on po.preventivo_id = p.id
group by p.id;

-- 5) Acconti in commessa da pagamenti online: metodi nuovi e un solo acconto per pagamento.
alter table public.acconti_commessa drop constraint if exists acconti_commessa_metodo_pagamento_check;
alter table public.acconti_commessa add constraint acconti_commessa_metodo_pagamento_check
  check (metodo_pagamento = any (array['contanti', 'bonifico', 'riba', 'altro', 'carta', 'rate']));
alter table public.acconti_commessa add column if not exists pagamento_online_id uuid
  references public.pagamenti_online(id) on delete set null;
alter table public.acconti_commessa drop constraint if exists acconti_commessa_pagamento_online_uq;
alter table public.acconti_commessa add constraint acconti_commessa_pagamento_online_uq unique (pagamento_online_id);
