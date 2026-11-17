create or replace function public.set_cron_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'cron_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'cron_secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

revoke all on function public.set_cron_secret(text) from public, anon, authenticated;
grant execute on function public.set_cron_secret(text) to service_role;
