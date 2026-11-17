-- notify() idempotent per event_id, juga untuk panggilan bersamaan.
drop index if exists public.notification_log_event_id_idx;
create unique index notification_log_event_id_key on public.notification_log (event_id);
