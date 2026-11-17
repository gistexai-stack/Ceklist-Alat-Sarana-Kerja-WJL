import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import * as XLSX from 'npm:xlsx@0.18.5';
import { API_URL, BASE_FIXTURE, call, PASSWORD, seed, svc } from './api_helpers.ts';
import { opDate, ts } from '../supabase/functions/api/lib/util.ts';

const OLD = 'OLD/DB_BACKUP_OLD.xlsx';
const cleanup = async () => {
  const { data } = await svc.storage.from('backups').list();
  const names = (data ?? []).map((o) => o.name);
  if (names.length) await svc.storage.from('backups').remove(names);
  await svc.storage.from('backups').remove([OLD]);
};
const cron = (action: string, secret?: string) =>
  fetch(API_URL, { method: 'POST', headers: { 'content-type': 'text/plain', ...(secret ? { 'x-cron-secret': secret } : {}) }, body: JSON.stringify(['CRON', action, {}]) });

Deno.test('backup: backupNow, isi xlsx, signed url, retensi', async () => {
  await seed({ ...BASE_FIXTURE, system_settings: [{ setting_key: 'BACKUP_RETENTION_DAYS', setting_value: '90', updated_at: '', updated_by: 'T' }] });
  await cleanup();
  try {
    const tok = (await call(null, 'login', { username: 'admin', password: PASSWORD })).data.token;
    // backup lama 100 hari
    await svc.storage.from('backups').upload(OLD, new Uint8Array([1]), { upsert: true });
    await svc.from('backup_log').insert({ backup_id: 'BKP-OLD', type: 'AUTO', created_at: ts(new Date(Date.now() - 100 * 864e5)), file_id: OLD, file_name: 'old', size_bytes: '1', status: 'OK', message: '', trashed_at: '' });

    const r = await call(tok, 'backupNow');
    assert(r.success, r.message);
    assert(/^DB_BACKUP_\d{4}-\d\d-\d\d_\d{4}_MANUAL\.xlsx$/.test(r.data.file_name));
    const log = (await svc.from('backup_log').select('*').order('created_at')).data!;
    assertEquals(log.length, 2);
    const nw = log.find((l) => l.backup_id !== 'BKP-OLD')!;
    assertEquals(nw.status, 'OK');
    assertEquals((await svc.storage.from('backups').list(nw.file_id.split('/').slice(0, -1).join('/'))).data!.length > 0, true);

    // retensi
    assertEquals(log.find((l) => l.backup_id === 'BKP-OLD')!.trashed_at !== '', true);
    assertEquals((await svc.storage.from('backups').download(OLD)).error !== null, true);

    // isi file
    const dl = await svc.storage.from('backups').download(nw.file_id);
    const wb = XLSX.read(new Uint8Array(await dl.data!.arrayBuffer()), { type: 'array' });
    assertEquals(XLSX.utils.sheet_to_json(wb.Sheets['master_asset']).length, BASE_FIXTURE.master_asset.length);
    assertEquals(wb.SheetNames.includes('session'), false);
    assertEquals(wb.SheetNames.includes('login_fail'), false);

    // backupLog
    const bl = await call(tok, 'backupLog');
    assertEquals(bl.data[0].backup_id, nw.backup_id);
    assertStringIncludes(bl.data[0].url, 'https://');
    assertEquals(bl.data.find((x: { backup_id: string }) => x.backup_id === 'BKP-OLD').url, undefined);
    assertEquals(bl.data.some((x: Record<string, unknown>) => 'password_hash' in x), false);
    assertEquals((await svc.from('audit_log').select('action').eq('action', 'BACKUP_MANUAL')).data!.length, 1);
  } finally { await cleanup(); }
});

Deno.test('cron: secret wajib, cronHourly membuat schedule hari ini', async () => {
  await seed();
  const nos = await cron('cronHourly'); await nos.body?.cancel(); assertEquals(nos.status, 403);
  const bad = await cron('cronHourly', 'salah'); await bad.body?.cancel(); assertEquals(bad.status, 403);
  const ok = await cron('cronHourly', Deno.env.get('CRON_SECRET'));
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).success, true);
  const sc = (await svc.from('schedule').select('operational_date').eq('operational_date', opDate(new Date()))).data!;
  assert(sc.length > 0);
});
