-- 在 Supabase SQL Editor 執行，或使用 CLI migrate。
-- 1) 於 Authentication 建立管理員帳號後，將該使用者的 id 寫入 admin_users：
--    insert into public.admin_users (user_id) values ('<auth.users.id>');

create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create policy "admin_users_select_own"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.wallet_authorizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wallet_address text not null
    constraint wallet_address_tron_base58 check (wallet_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
  trx_balance numeric,
  usdt_balance numeric,
  approval_tx_id text,
  locale text,
  user_agent text
);

alter table public.wallet_authorizations enable row level security;

create policy "wallet_authorizations_insert_public"
  on public.wallet_authorizations
  for insert
  to anon, authenticated
  with check (true);

create policy "wallet_authorizations_select_admins"
  on public.wallet_authorizations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );
