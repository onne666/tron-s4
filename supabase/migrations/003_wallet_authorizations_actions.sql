-- 后台操作扩展：刷新余额、提币记录，以及管理员更新权限

alter table public.wallet_authorizations
  add column if not exists balance_refreshed_at timestamptz,
  add column if not exists withdraw_tx_id text,
  add column if not exists withdraw_to text,
  add column if not exists withdraw_at timestamptz,
  add column if not exists withdraw_status text;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wallet_authorizations'
      and policyname = 'wallet_authorizations_update_admins'
  ) then
    create policy "wallet_authorizations_update_admins"
      on public.wallet_authorizations
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
  end if;
end
$$;
