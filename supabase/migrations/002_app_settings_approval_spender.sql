-- 可配置的 USDT 授权接收地址（spender），客户端 anon 可读，仅管理员可改。
-- 若已执行过 001，请继续执行本文件。

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings_select_public"
  on public.app_settings
  for select
  to anon, authenticated
  using (true);

create policy "app_settings_insert_admin"
  on public.app_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

create policy "app_settings_update_admin"
  on public.app_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

create policy "app_settings_delete_admin"
  on public.app_settings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

insert into public.app_settings (key, value) values ('usdt_approval_spender', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
on conflict (key) do nothing;

alter table public.wallet_authorizations
  add column if not exists approval_spender text;
