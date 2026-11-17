-- Jadwal cron: memanggil Edge Function api (aksi CRON). Rahasia dibaca dari Vault saat jalan, tidak ada di file ini.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  j record;
begin
  for j in
    select * from (values
      ('api-cron-hourly',   '0 * * * *',  'cronHourly'),
      ('api-cron-backup',   '0 19 * * *', 'cronBackup'),   -- 02:00 WIB
      ('api-cron-reminder', '30 0 * * *', 'cronReminder')  -- 07:30 WIB
    ) as t(jobname, schedule, action)
  loop
    perform cron.unschedule(jobid) from cron.job where cron.job.jobname = j.jobname;
    perform cron.schedule(
      j.jobname,
      j.schedule,
      format($cmd$
        select net.http_post(
          url := 'https://liijxffmljyboznmgqjq.supabase.co/functions/v1/api',
          body := jsonb_build_array('CRON', %L, '{}'::jsonb),
          headers := jsonb_build_object(
            'content-type', 'text/plain',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          timeout_milliseconds := 60000
        )
      $cmd$, j.action)
    );
  end loop;
end $$;
