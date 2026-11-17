-- Fase tulis submitChecklist dalam SATU transaksi (port submitChecklist_/mergeFindings_/recomputeCase_ dari Code.gs).
create unique index repair_item_case_cp on public.repair_item (case_id, checkpoint_id);

create or replace function public.submit_checklist(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_now text := p->>'now_str';
  v_cl text := p->>'checklist_id';
  v_sch public.schedule%rowtype;
  v_asset public.master_asset%rowtype;
  v_case public.repair_case%rowtype;
  v_item public.repair_item%rowtype;
  v_chk jsonb := p->'checker';
  d jsonb;
  v_did text; v_ok int := 0; v_nok int := 0; v_max int; v_dept text; v_new boolean := false;
begin
  update public.schedule set status = 'DONE', checklist_id = v_cl, closed_at = v_now, processed_at = v_now
    where schedule_id = p->>'schedule_id' and status = 'OPEN' returning * into v_sch;
  if not found then raise exception 'SCHEDULE_DUPLICATE'; end if;
  select * into v_asset from public.master_asset where asset_id = v_sch.asset_id;

  for d in select * from jsonb_array_elements(p->'details') loop
    insert into public.checklist_detail (detail_id, checklist_id, checkpoint_id, point_name_snapshot, result, photo_file_id, photo_url, finding_note, case_id, case_item_id, recorded_at)
      values (d->>'detail_id', v_cl, d->>'checkpoint_id', d->>'point_name', d->>'result', d->>'photo_file_id', d->>'photo_url', d->>'note', '', '', v_now);
    if d->>'result' = 'NO OK' then v_nok := v_nok + 1; else v_ok := v_ok + 1; end if;
  end loop;
  insert into public.checklist_header (checklist_id, schedule_id, asset_id, asset_name_snapshot, operational_date, shift_code, checker_person_id, checker_name_snapshot, checker_role, submitted_at, ok_count, nok_count, overall_result)
    values (v_cl, v_sch.schedule_id, v_asset.asset_id, v_asset.asset_name, v_sch.operational_date, v_sch.shift_code, v_chk->>'person_id', v_chk->>'name', v_chk->>'role', v_now,
      v_ok::text, v_nok::text, case when v_nok > 0 then 'NO OK' else 'OK' end);

  if v_nok = 0 then return jsonb_build_object('checklist_id', v_cl, 'nok', 0, 'case_id', ''); end if;

  -- satu kasus terbuka per alat; 23505 (kasus dibuat transaksi lain) naik ke pemanggil yang mengulang
  select * into v_case from public.repair_case
    where asset_id = v_asset.asset_id and status in ('PERLU_PERBAIKAN','SEDANG_DIPERBAIKI','MENUNGGU_SPV','MENUNGGU_HEAD') for update;
  if not found then
    select coalesce(max(substring(case_id from '^CASE-(\d+)$')::int), 0) into v_max from public.repair_case;
    insert into public.repair_case (case_id, asset_id, asset_name_snapshot, opened_at, status, first_finding_at, last_activity_at, closed_at, rework_count, cycle_no)
      values ('CASE-' || lpad((v_max + 1)::text, 5, '0'), v_asset.asset_id, v_asset.asset_name, v_now, 'PERLU_PERBAIKAN', v_now, v_now, '', '0', '1')
      returning * into v_case;
    v_new := true;
  end if;

  for d in select * from jsonb_array_elements(p->'details') where value->>'result' = 'NO OK' loop
    v_did := d->>'detail_id';
    select * into v_item from public.repair_item where case_id = v_case.case_id and checkpoint_id = d->>'checkpoint_id' for update;
    if found then
      if v_item.status = 'DONE' then -- NO OK berulang sebelum Head approve -> buka lagi (log memakai kondisi sebelum reset)
        insert into public.repair_log (log_id, case_id, case_item_id, event, cycle_no, actor_name, repair_action, started_at, completed_at, after_photo_file_id, note, created_at)
          values ('RL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_case.case_id, v_item.case_item_id, 'REOPEN_NOK', v_case.cycle_no, 'SYSTEM',
            v_item.repair_action, v_item.started_at, v_item.completed_at, v_item.after_photo_file_id, 'NO OK berulang pada checklist ' || v_cl, v_now);
        update public.repair_item set status = 'OPEN', claimed_by_person_id = '', claimed_by_name_snapshot = '', repair_action = '', started_at = '', completed_at = '', after_photo_file_id = ''
          where case_item_id = v_item.case_item_id;
      end if;
      update public.repair_item set occurrence_count = (coalesce(nullif(occurrence_count, ''), '0')::int + 1)::text, last_detail_id = v_did
        where case_item_id = v_item.case_item_id;
    else
      select repair_department into v_dept from public.master_checkpoint where checkpoint_id = d->>'checkpoint_id';
      v_item.case_item_id := 'CI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      insert into public.repair_item (case_item_id, case_id, checkpoint_id, point_name_snapshot, department, status, claimed_by_person_id, claimed_by_name_snapshot, repair_action,
          started_at, completed_at, after_photo_file_id, occurrence_count, first_detail_id, last_detail_id, rework_count, last_reject_note, created_at)
        values (v_item.case_item_id, v_case.case_id, d->>'checkpoint_id', d->>'point_name', v_dept, 'OPEN', '', '', '', '', '', '', '1', v_did, v_did, '0', '', v_now);
    end if;
    update public.checklist_detail set case_id = v_case.case_id, case_item_id = v_item.case_item_id where detail_id = v_did;
  end loop;

  -- recomputeCase_: item NO OK baru selalu OPEN, jadi cabang "semua DONE" tidak mungkin di sini
  update public.repair_case set last_activity_at = v_now,
      cycle_no = case when status in ('MENUNGGU_SPV','MENUNGGU_HEAD') then (coalesce(nullif(cycle_no, ''), '0')::int + 1)::text else cycle_no end,
      status = case when exists (select 1 from public.repair_item where case_id = v_case.case_id and status <> 'OPEN') then 'SEDANG_DIPERBAIKI' else 'PERLU_PERBAIKAN' end
    where case_id = v_case.case_id;
  return jsonb_build_object('checklist_id', v_cl, 'nok', v_nok, 'case_id', v_case.case_id, 'new_case', v_new);
end $$;

revoke all on function public.submit_checklist(jsonb) from public, anon, authenticated;
grant execute on function public.submit_checklist(jsonb) to service_role;
