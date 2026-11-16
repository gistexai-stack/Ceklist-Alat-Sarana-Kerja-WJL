-- Skema dari SCHEMA di Code.gs; semua kolom text, PK = kolom pertama.
create table public.master_asset (
  "asset_id" text not null default '' primary key,
  "source_no" text not null default '',
  "asset_name" text not null default '',
  "active" text not null default '',
  "schedule_type" text not null default '',
  "pic_group" text not null default '',
  "checker_role" text not null default '',
  "pic_ids" text not null default '',
  "activated_at" text not null default '',
  "created_at" text not null default '',
  "updated_at" text not null default ''
);
create table public.master_checkpoint (
  "checkpoint_id" text not null default '' primary key,
  "asset_id" text not null default '',
  "point_name" text not null default '',
  "display_order" text not null default '',
  "target_label" text not null default '',
  "repair_department" text not null default '',
  "active" text not null default '',
  "created_at" text not null default '',
  "updated_at" text not null default ''
);
create table public.master_person (
  "person_id" text not null default '' primary key,
  "display_name" text not null default '',
  "role_type" text not null default '',
  "active" text not null default '',
  "created_at" text not null default '',
  "updated_at" text not null default ''
);
create table public.master_account (
  "account_id" text not null default '' primary key,
  "username" text not null default '',
  "display_name" text not null default '',
  "role" text not null default '',
  "password_hash" text not null default '',
  "salt" text not null default '',
  "active" text not null default '',
  "last_login_at" text not null default '',
  "created_at" text not null default '',
  "updated_at" text not null default ''
);
create table public.schedule (
  "schedule_id" text not null default '' primary key,
  "asset_id" text not null default '',
  "operational_date" text not null default '',
  "shift_code" text not null default '',
  "open_at" text not null default '',
  "close_at" text not null default '',
  "status" text not null default '',
  "checklist_id" text not null default '',
  "closed_at" text not null default '',
  "processed_at" text not null default ''
);
create table public.checklist_header (
  "checklist_id" text not null default '' primary key,
  "schedule_id" text not null default '',
  "asset_id" text not null default '',
  "asset_name_snapshot" text not null default '',
  "operational_date" text not null default '',
  "shift_code" text not null default '',
  "checker_person_id" text not null default '',
  "checker_name_snapshot" text not null default '',
  "checker_role" text not null default '',
  "submitted_at" text not null default '',
  "ok_count" text not null default '',
  "nok_count" text not null default '',
  "overall_result" text not null default ''
);
create table public.checklist_detail (
  "detail_id" text not null default '' primary key,
  "checklist_id" text not null default '',
  "checkpoint_id" text not null default '',
  "point_name_snapshot" text not null default '',
  "result" text not null default '',
  "photo_file_id" text not null default '',
  "photo_url" text not null default '',
  "finding_note" text not null default '',
  "case_id" text not null default '',
  "case_item_id" text not null default '',
  "recorded_at" text not null default ''
);
create table public.repair_case (
  "case_id" text not null default '' primary key,
  "asset_id" text not null default '',
  "asset_name_snapshot" text not null default '',
  "opened_at" text not null default '',
  "status" text not null default '',
  "first_finding_at" text not null default '',
  "last_activity_at" text not null default '',
  "closed_at" text not null default '',
  "rework_count" text not null default '',
  "cycle_no" text not null default ''
);
create table public.repair_item (
  "case_item_id" text not null default '' primary key,
  "case_id" text not null default '',
  "checkpoint_id" text not null default '',
  "point_name_snapshot" text not null default '',
  "department" text not null default '',
  "status" text not null default '',
  "claimed_by_person_id" text not null default '',
  "claimed_by_name_snapshot" text not null default '',
  "repair_action" text not null default '',
  "started_at" text not null default '',
  "completed_at" text not null default '',
  "after_photo_file_id" text not null default '',
  "occurrence_count" text not null default '',
  "first_detail_id" text not null default '',
  "last_detail_id" text not null default '',
  "rework_count" text not null default '',
  "last_reject_note" text not null default '',
  "created_at" text not null default ''
);
create table public.repair_log (
  "log_id" text not null default '' primary key,
  "case_id" text not null default '',
  "case_item_id" text not null default '',
  "event" text not null default '',
  "cycle_no" text not null default '',
  "actor_name" text not null default '',
  "repair_action" text not null default '',
  "started_at" text not null default '',
  "completed_at" text not null default '',
  "after_photo_file_id" text not null default '',
  "note" text not null default '',
  "created_at" text not null default ''
);
create table public.approval (
  "approval_id" text not null default '' primary key,
  "case_id" text not null default '',
  "level" text not null default '',
  "approver_account_id" text not null default '',
  "approver_name" text not null default '',
  "approver_role" text not null default '',
  "decision" text not null default '',
  "note" text not null default '',
  "reopened_items" text not null default '',
  "decided_at" text not null default '',
  "cycle_no" text not null default ''
);
create table public.notification_log (
  "notification_id" text not null default '' primary key,
  "event_id" text not null default '',
  "event_type" text not null default '',
  "target_group" text not null default '',
  "payload_summary" text not null default '',
  "message" text not null default '',
  "status" text not null default '',
  "provider_response" text not null default '',
  "attempt_count" text not null default '',
  "created_at" text not null default '',
  "sent_at" text not null default ''
);
create table public.system_settings (
  "setting_key" text not null default '' primary key,
  "setting_value" text not null default '',
  "updated_at" text not null default '',
  "updated_by" text not null default ''
);
create table public.audit_log (
  "audit_id" text not null default '' primary key,
  "actor_type" text not null default '',
  "actor_id" text not null default '',
  "actor_name" text not null default '',
  "action" text not null default '',
  "entity_type" text not null default '',
  "entity_id" text not null default '',
  "before_json" text not null default '',
  "after_json" text not null default '',
  "reason" text not null default '',
  "created_at" text not null default ''
);
create table public.backup_log (
  "backup_id" text not null default '' primary key,
  "type" text not null default '',
  "created_at" text not null default '',
  "file_id" text not null default '',
  "file_name" text not null default '',
  "size_bytes" text not null default '',
  "status" text not null default '',
  "message" text not null default '',
  "trashed_at" text not null default ''
);

create table public.session (token text primary key, data jsonb not null, expires_at timestamptz not null);
create table public.login_fail (username text primary key, fails int not null, until timestamptz not null);

create index on public.schedule (operational_date);
create index on public.schedule (asset_id);
create index on public.checklist_detail (checklist_id);
create index on public.repair_item (case_id);
create index on public.repair_log (case_id);
create index on public.approval (case_id);
create index on public.notification_log (event_id);
create unique index repair_case_open_per_asset on public.repair_case (asset_id)
  where status in ('PERLU_PERBAIKAN','SEDANG_DIPERBAIKI','MENUNGGU_SPV','MENUNGGU_HEAD');

do $$ declare t text; begin
  for t in select unnest(array['master_asset','master_checkpoint','master_person','master_account','schedule','checklist_header','checklist_detail','repair_case','repair_item','repair_log','approval','notification_log','system_settings','audit_log','backup_log','session','login_fail']) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
