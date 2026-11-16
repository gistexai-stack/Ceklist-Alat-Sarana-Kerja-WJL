insert into storage.buckets (id, name, public) values ('photos','photos',false), ('backups','backups',false)
on conflict (id) do nothing;

create or replace function public.get_fonnte_token() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'fonnte_token' limit 1;
$$;

create or replace function public.set_fonnte_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'fonnte_token';
  if coalesce(p_token,'') = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
  elsif v_id is null then
    perform vault.create_secret(p_token, 'fonnte_token');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $$;

revoke all on function public.get_fonnte_token() from public, anon, authenticated;
revoke all on function public.set_fonnte_token(text) from public, anon, authenticated;
grant execute on function public.get_fonnte_token() to service_role;
grant execute on function public.set_fonnte_token(text) to service_role;
