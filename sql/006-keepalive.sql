-- Keep-alive: una piccola scrittura vera nel database, chiamata dal workflow
-- GitHub "Keep Supabase awake" due volte al giorno. Una scrittura conta come
-- attività più di una semplice lettura, così il progetto non va in pausa.
-- Esegui dopo 005: Supabase → SQL Editor → New query → Run. Si può rieseguire.

create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings bigint not null default 0
);

alter table public.keepalive enable row level security;
-- Nessuna policy: dall'esterno si passa solo dalla funzione qui sotto.

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.keepalive (id, pinged_at, pings) values (1, now(), 1)
  on conflict (id) do update set pinged_at = now(), pings = keepalive.pings + 1
  returning pinged_at;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- Controllo: deve restituire l'ora attuale.
select public.keepalive();
