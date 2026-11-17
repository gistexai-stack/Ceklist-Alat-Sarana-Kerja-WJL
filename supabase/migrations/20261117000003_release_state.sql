-- releaseItem_: pesan khusus untuk item yang tidak sedang diambil (Code.gs: Item tidak sedang diambil / STATE).
create or replace function public.release_item(p jsonb) returns jsonb
language plpgsql as $$
declare c public.repair_case; it public.repair_item; v_now text := p->>'now_str'; v_before jsonb; v_reason text := coalesce(p->>'reason', '');
begin
  perform public._lock_repair_item(p->>'case_item_id');
  select * into it from public.repair_item where case_item_id = p->>'case_item_id';
  select * into c from public.repair_case where case_id = it.case_id;
  if it.status <> 'CLAIMED' then raise exception 'RELEASE_STATE'; end if;
  v_before := to_jsonb(it);
  perform public._log_repair(c, it, 'RELEASE', 'Dilepas oleh ' || (p->>'name') || case when v_reason <> '' then ': ' || v_reason else '' end, v_now, p->>'name');
  update public.repair_item set status = 'OPEN', claimed_by_person_id = '', claimed_by_name_snapshot = '', repair_action = '', started_at = '', completed_at = '', after_photo_file_id = ''
    where case_item_id = it.case_item_id returning * into it;
  perform public._recompute_case(c.case_id, v_now);
  return jsonb_build_object('before', v_before, 'after', to_jsonb(it));
end $$;
