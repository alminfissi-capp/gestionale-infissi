-- Sincronizzazione automatica delle fatture con Fatture in Cloud.
-- Un interruttore per scheda (Fornitori / Clienti) e un giro orario lanciato da
-- pg_cron, che chiama /api/cron/sync-fatture con un segreto custodito nel Vault.

alter table public.fic_collegamenti
  add column if not exists sync_automatica boolean not null default false,
  add column if not exists emesse_sync_automatica boolean not null default false;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Segreto condiviso fra il cron e la route: generato qui, non esce mai dal database
-- se non nella chiamata del cron.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_sync_fatture') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'cron_sync_fatture');
  end if;
end $$;

-- La route verifica il segreto ricevuto senza poterlo leggere.
create or replace function public.cron_sync_fatture_valido(p_segreto text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_sync_fatture' and decrypted_secret = p_segreto
  );
$$;
revoke all on function public.cron_sync_fatture_valido(text) from public, anon, authenticated;
grant execute on function public.cron_sync_fatture_valido(text) to service_role;

-- Ogni ora: fornitori al minuto 5, emesse al 35 (giri separati, ognuno entro i 300 s della route).
select cron.schedule(
  'sync-fatture-fornitori',
  '5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://gestionale-infissi.vercel.app/api/cron/sync-fatture?tipo=fornitori',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_fatture')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);

select cron.schedule(
  'sync-fatture-emesse',
  '35 * * * *',
  $cron$
  select net.http_post(
    url := 'https://gestionale-infissi.vercel.app/api/cron/sync-fatture?tipo=emesse',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_fatture')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);
