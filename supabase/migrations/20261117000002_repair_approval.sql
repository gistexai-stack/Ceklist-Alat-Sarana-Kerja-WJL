-- Tulis perbaikan & approval, masing-masing SATU transaksi (port claimItem_/completeItem_/releaseItem_/decide_ dari Code.gs).
-- Urutan kunci sama dengan submit_checklist: schedule -> case -> item. Kasus dikunci FOR UPDATE SEBELUM item mana pun.
-- Kegagalan prasyarat = exception dengan pesan kode; TS memetakannya ke pesan/kode Code.gs.

create or replace function public._log_repair(c public.repair_case, it public.repair_item, p_event text, p_note text, p_now text, p_actor text) returns void
language sql as $$
  insert into public.repair_log (log_id, case_id, case_item_id, event, cycle_no, actor_name, repair_action, started_at, completed_at, after_photo_file_id, note, created_at)
  values ('RL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), c.case_id, it.case_item_id, p_event, c.cycle_no,
    coalesce(nullif(p_actor, ''), it.claimed_by_name_snapshot), it.repair_action, it.started_at, it.completed_at, it.after_photo_file_id, coalesce(p_note, ''), p_now);
$$;

-- recomputeCase_: kasus sudah terkunci oleh pemanggil. Return 'TO_SPV' bila semua item DONE.
create or replace function public._recompute_case(p_case text, p_now text) returns text
language plpgsql as $$
declare c public.repair_case%rowtype; v_n int; v_all boolean; v_any boolean; v_wait boolean;
begin
  select * into c from public.repair_case where case_id = p_case;
  if c.status = 'SELESAI' then return null; end if;
  select count(*), coalesce(bool_and(status = 'DONE'), false), coalesce(bool_or(status <> 'OPEN'), false) into v_n, v_all, v_any
    from public.repair_item where case_id = p_case;
  v_wait := c.status in ('MENUNGGU_SPV', 'MENUNGGU_HEAD');
  if v_n > 0 and v_all then
    if v_wait then return null; end if;
    update public.repair_case set status = 'MENUNGGU_SPV', last_activity_at = p_now where case_id = p_case;
    return 'TO_SPV';
  end if;
  update public.repair_case set last_activity_at = p_now,
    cycle_no = case when v_wait then (coalesce(nullif(cycle_no, ''), '0')::int + 1)::text else cycle_no end,
    status = case when v_any then 'SEDANG_DIPERBAIKI' else 'PERLU_PERBAIKAN' end
    where case_id = p_case;
  return null;
end $$;

-- Kunci kasus lalu item (urutan case -> item); cek tahap perbaikan. Pemanggil membaca barisnya sesudahnya.
create or replace function public._lock_repair_item(p_item text) returns void
language plpgsql as $$
declare v_case text; v_status text;
begin
  select case_id into v_case from public.repair_item where case_item_id = p_item;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select status into v_status from public.repair_case where case_id = v_case for update;
  if v_status not in ('PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI') then raise exception 'PHASE'; end if;
  perform 1 from public.repair_item where case_item_id = p_item for update;
end $$;

create or replace function public.claim_item(p jsonb) returns jsonb
language plpgsql as $$
declare c public.repair_case; it public.repair_item; v_now text := p->>'now_str';
begin
  perform public._lock_repair_item(p->>'case_item_id');
  select * into it from public.repair_item where case_item_id = p->>'case_item_id';
  select * into c from public.repair_case where case_id = it.case_id;
  if it.status <> 'OPEN' then raise exception 'TAKEN:%', coalesce(nullif(it.claimed_by_name_snapshot, ''), 'teknisi lain'); end if;
  update public.repair_item set status = 'CLAIMED', claimed_by_person_id = p->>'person_id', claimed_by_name_snapshot = p->>'name', started_at = v_now
    where case_item_id = it.case_item_id returning * into it;
  perform public._log_repair(c, it, 'CLAIM', '', v_now, p->>'name');
  perform public._recompute_case(c.case_id, v_now);
  return jsonb_build_object('case_status', (select status from public.repair_case where case_id = c.case_id));
end $$;

create or replace function public.complete_item(p jsonb) returns jsonb
language plpgsql as $$
declare c public.repair_case; it public.repair_item; v_now text := p->>'now_str'; v_ev text;
begin
  perform public._lock_repair_item(p->>'case_item_id');
  select * into it from public.repair_item where case_item_id = p->>'case_item_id';
  select * into c from public.repair_case where case_id = it.case_id;
  if it.status <> 'CLAIMED' or it.claimed_by_person_id <> p->>'person_id' then raise exception 'ITEM_STATE'; end if;
  update public.repair_item set status = 'DONE', repair_action = p->>'action', completed_at = v_now, after_photo_file_id = p->>'photo_id'
    where case_item_id = it.case_item_id returning * into it;
  perform public._log_repair(c, it, 'DONE', '', v_now, p->>'name');
  v_ev := public._recompute_case(c.case_id, v_now);
  select * into c from public.repair_case where case_id = c.case_id;
  return jsonb_build_object('case_status', c.status, 'cycle_no', c.cycle_no, 'ev', v_ev);
end $$;

create or replace function public.release_item(p jsonb) returns jsonb
language plpgsql as $$
declare c public.repair_case; it public.repair_item; v_now text := p->>'now_str'; v_before jsonb; v_reason text := coalesce(p->>'reason', '');
begin
  perform public._lock_repair_item(p->>'case_item_id');
  select * into it from public.repair_item where case_item_id = p->>'case_item_id';
  select * into c from public.repair_case where case_id = it.case_id;
  if it.status <> 'CLAIMED' then raise exception 'ITEM_STATE'; end if;
  v_before := to_jsonb(it);
  perform public._log_repair(c, it, 'RELEASE', 'Dilepas oleh ' || (p->>'name') || case when v_reason <> '' then ': ' || v_reason else '' end, v_now, p->>'name');
  update public.repair_item set status = 'OPEN', claimed_by_person_id = '', claimed_by_name_snapshot = '', repair_action = '', started_at = '', completed_at = '', after_photo_file_id = ''
    where case_item_id = it.case_item_id returning * into it;
  perform public._recompute_case(c.case_id, v_now);
  return jsonb_build_object('before', v_before, 'after', to_jsonb(it));
end $$;

create or replace function public.decide_case(p jsonb) returns jsonb
language plpgsql as $$
declare
  c public.repair_case; it public.repair_item; v_now text := p->>'now_str'; v_dec text := p->>'decision'; v_note text := p->>'note';
  v_level text; v_role text := p->>'role'; v_ev text; v_before jsonb; v_reopen jsonb := '[]'; v_ids text;
begin
  select * into c from public.repair_case where case_id = p->>'case_id' for update;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  v_level := case c.status when 'MENUNGGU_SPV' then 'SPV' when 'MENUNGGU_HEAD' then 'HEAD' else '' end;
  if v_level = '' then raise exception 'CASE_STATE'; end if;
  if p->>'cycle_no' <> c.cycle_no or (coalesce(p->>'level', '') <> '' and p->>'level' <> v_level) then raise exception 'STALE'; end if;
  if v_role <> 'ADMIN' and v_role <> v_level then raise exception 'FORBIDDEN_LEVEL:%', v_level; end if;
  if v_dec = 'REJECT' then
    if v_note = '' then raise exception 'NOTE_REQUIRED'; end if;
    perform 1 from public.repair_item where case_id = c.case_id and (p->'item_ids') ? case_item_id order by case_item_id for update;
    if not found then raise exception 'NO_REOPEN'; end if;
    select string_agg(case_item_id, ',' order by case_item_id), jsonb_agg(jsonb_build_object('point_name_snapshot', point_name_snapshot, 'department', department) order by case_item_id)
      into v_ids, v_reopen from public.repair_item where case_id = c.case_id and (p->'item_ids') ? case_item_id;
  end if;
  v_before := jsonb_build_object('status', c.status, 'cycle_no', c.cycle_no);
  insert into public.approval (approval_id, case_id, level, approver_account_id, approver_name, approver_role, decision, note, reopened_items, decided_at, cycle_no)
    values (p->>'approval_id', c.case_id, v_level, p->>'account_id', p->>'name', v_role, v_dec, v_note, coalesce(v_ids, ''), v_now, c.cycle_no);
  if v_dec = 'APPROVE' then
    if v_level = 'SPV' then
      update public.repair_case set status = 'MENUNGGU_HEAD' where case_id = c.case_id; v_ev := 'HEAD';
    else
      update public.repair_case set status = 'SELESAI', closed_at = v_now where case_id = c.case_id; v_ev := 'DONE';
    end if;
  else
    for it in select * from public.repair_item where case_id = c.case_id and (p->'item_ids') ? case_item_id order by case_item_id loop
      perform public._log_repair(c, it, 'REOPEN_REJECT', 'Ditolak ' || v_level || ' (' || (p->>'name') || '): ' || v_note, v_now, p->>'name');
      update public.repair_item set status = 'OPEN', claimed_by_person_id = '', claimed_by_name_snapshot = '', repair_action = '', started_at = '', completed_at = '', after_photo_file_id = '',
        rework_count = (coalesce(nullif(rework_count, ''), '0')::int + 1)::text, last_reject_note = v_note
        where case_item_id = it.case_item_id;
    end loop;
    update public.repair_case set status = 'PERLU_PERBAIKAN', rework_count = (coalesce(nullif(rework_count, ''), '0')::int + 1)::text,
      cycle_no = (coalesce(nullif(cycle_no, ''), '0')::int + 1)::text where case_id = c.case_id;
    perform public._recompute_case(c.case_id, v_now);
    v_ev := 'REJECT';
  end if;
  update public.repair_case set last_activity_at = v_now where case_id = c.case_id;
  select * into c from public.repair_case where case_id = c.case_id;
  return jsonb_build_object('status', c.status, 'cycle_no', c.cycle_no, 'ev', v_ev, 'level', v_level, 'reopen', v_reopen, 'before', v_before);
end $$;

revoke all on function public._log_repair(public.repair_case, public.repair_item, text, text, text, text) from public, anon, authenticated;
revoke all on function public._recompute_case(text, text) from public, anon, authenticated;
revoke all on function public._lock_repair_item(text) from public, anon, authenticated;
revoke all on function public.claim_item(jsonb) from public, anon, authenticated;
revoke all on function public.complete_item(jsonb) from public, anon, authenticated;
revoke all on function public.release_item(jsonb) from public, anon, authenticated;
revoke all on function public.decide_case(jsonb) from public, anon, authenticated;
grant execute on function public._log_repair(public.repair_case, public.repair_item, text, text, text, text) to service_role;
grant execute on function public._recompute_case(text, text) to service_role;
grant execute on function public._lock_repair_item(text) to service_role;
grant execute on function public.claim_item(jsonb) to service_role;
grant execute on function public.complete_item(jsonb) to service_role;
grant execute on function public.release_item(jsonb) to service_role;
grant execute on function public.decide_case(jsonb) to service_role;
