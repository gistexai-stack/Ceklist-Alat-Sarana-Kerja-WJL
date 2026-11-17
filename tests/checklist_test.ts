import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { BASE_FIXTURE, call, PASSWORD, seed, svc } from './api_helpers.ts';
import { markMissed } from '../supabase/functions/api/lib/schedule.ts';
import { opDate, shiftOf, ts } from '../supabase/functions/api/lib/util.ts';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const now = new Date();
const today = opDate(now);
const setting = (k: string, v: string) => ({ setting_key: k, setting_value: v, updated_at: '', updated_by: 'TEST' });
const rows = async (t: string, col = '*') => (await svc.from(t).select(col)).data as any[];
const guest = async (role: string, person_id: string) => (await call(null, 'guestLogin', { role, person_id })).data.token as string;
const results = (form: any, nokIds: string[] = []) =>
  form.points.map((p: any) => nokIds.includes(p.checkpoint_id) ? { checkpoint_id: p.checkpoint_id, result: 'NO OK', photo: JPEG, note: ' rusak ' } : { checkpoint_id: p.checkpoint_id, result: 'OK' });
const extraSchedule = (id: string, close_at: string) => ({ schedule_id: id, asset_id: 'AST-DAILY', operational_date: today, shift_code: '', open_at: ts(new Date(now.getTime() - 36e5)),
  close_at, status: 'OPEN', checklist_id: '', closed_at: '', processed_at: '' });

let pic: string, utl: string;
const dailyId = 'SCH-' + today.replace(/-/g, '') + '-AST-DAILY-D';
const shiftId = 'SCH-' + today.replace(/-/g, '') + '-AST-SHIFT-' + shiftOf(now);

Deno.test('worklist membuat jadwal: DAILY hari ini, SHIFT hanya shift berjalan', async () => {
  await seed({ ...BASE_FIXTURE, system_settings: [setting('ACTIVATED_AT', ts(new Date(now.getTime() - 864e5)))] });
  pic = await guest('PIC', 'PRS-PIC1');
  utl = await guest('UTILITY', 'PRS-UTL1');
  const w = await call(pic, 'worklist');
  assertEquals(w.success, true);
  assertEquals(w.data.items.map((i: any) => [i.schedule_id, i.points, i.done]), [[dailyId, 3, false]]);
  const u = (await call(utl, 'worklist')).data.items;
  assertEquals(u.length, 1);
  assertEquals([u[0].schedule_id, u[0].shift_code], [shiftId, shiftOf(now)]);
  assertEquals((await rows('schedule')).length, 4); // 1 harian + 3 shift
});

Deno.test('submit semua OK -> DONE, submit kedua ditolak', async () => {
  const form = (await call(pic, 'checklistForm', { schedule_id: dailyId })).data;
  assertEquals(form.points.length, 3);
  const r = await call(pic, 'submitChecklist', { schedule_id: dailyId, results: results(form) });
  assertEquals([r.success, r.data.nok, r.data.case_id], [true, 0, '']);
  const [h] = await rows('checklist_header');
  assertEquals([h.ok_count, h.nok_count, h.overall_result], ['3', '0', 'OK']);
  assertEquals((await rows('schedule')).find((s) => s.schedule_id === dailyId).status, 'DONE');
  assertEquals((await call(pic, 'submitChecklist', { schedule_id: dailyId, results: results(form) })).success, false);
  const d = await call(pic, 'checklistDetail', {}); // PIC bukan peran LOGGED
  assertEquals(d.code, 'FORBIDDEN');
});

Deno.test('foto tidak valid / terlalu besar', async () => {
  const form = (await call(utl, 'checklistForm', { schedule_id: shiftId })).data;
  const res = (photo: string) => results(form, ['CP-4']).map((x: any) => x.photo ? { ...x, photo } : x);
  assertEquals((await call(utl, 'submitChecklist', { schedule_id: shiftId, results: res('data:image/gif;base64,R0lGODlh') })).code, 'PHOTO_INVALID');
  await svc.from('system_settings').upsert(setting('PHOTO_MAX_KB', '1'));
  const big = await call(utl, 'submitChecklist', { schedule_id: shiftId, results: res('data:image/png;base64,' + btoa('a'.repeat(2048))) });
  await svc.from('system_settings').upsert(setting('PHOTO_MAX_KB', '5120'));
  assertEquals(big.code, 'PHOTO_TOO_BIG');
  assertEquals((await rows('schedule')).find((s) => s.schedule_id === shiftId).status, 'OPEN');
});

Deno.test('NO OK + foto -> kasus baru, foto bisa diambil via signed URL', async () => {
  const form = (await call(utl, 'checklistForm', { schedule_id: shiftId })).data;
  const r = await call(utl, 'submitChecklist', { schedule_id: shiftId, results: results(form, ['CP-4']) });
  assertEquals([r.success, r.data.nok, r.data.case_id], [true, 1, 'CASE-00001']);
  const [c] = await rows('repair_case');
  assertEquals([c.case_id, c.status, c.asset_id], ['CASE-00001', 'PERLU_PERBAIKAN', 'AST-SHIFT']);
  const nok = (await rows('checklist_detail')).find((d) => d.result === 'NO OK');
  assert(nok.photo_file_id.length >= 20);
  assertEquals([nok.case_id, nok.finding_note], ['CASE-00001', 'rusak']);
  const p = await call(utl, 'photo', { id: nok.photo_file_id });
  assertMatch(p.data, /^https:\/\/.+\/storage\/v1\/object\/sign\/photos\/.+/);
  assertEquals((await fetch(p.data)).status, 200);
  assertEquals((await call(utl, 'photo', { id: 'pendek' })).success, false);
});

Deno.test('dua NO OK bersamaan untuk alat sama -> satu kasus terbuka', async () => {
  await svc.from('schedule').insert([extraSchedule('SCH-X1', ts(new Date(now.getTime() + 36e5))), extraSchedule('SCH-X2', ts(new Date(now.getTime() + 36e5)))]);
  const form = (await call(pic, 'checklistForm', { schedule_id: 'SCH-X1' })).data;
  const [a, b] = await Promise.all([
    call(pic, 'submitChecklist', { schedule_id: 'SCH-X1', results: results(form, ['CP-1']) }),
    call(pic, 'submitChecklist', { schedule_id: 'SCH-X2', results: results(form, ['CP-2']) }),
  ]);
  assertEquals([a.success, b.success], [true, true]);
  const cases = (await rows('repair_case')).filter((c) => c.asset_id === 'AST-DAILY');
  assertEquals(cases.length, 1);
  assertEquals(a.data.case_id, b.data.case_id);
  const items = (await rows('repair_item')).filter((i) => i.case_id === cases[0].case_id);
  assertEquals(items.map((i) => i.checkpoint_id).sort(), ['CP-1', 'CP-2']);
  const linked = (await rows('checklist_detail')).filter((d) => d.result === 'NO OK' && d.case_id === cases[0].case_id);
  assertEquals(linked.length, 2);
});

Deno.test('jadwal lewat close_at: MISSED di tampilan, lalu di tabel setelah markMissed', async () => {
  await svc.from('schedule').insert(extraSchedule('SCH-OLD', ts(new Date(now.getTime() - 60e3))));
  const admin = (await call(null, 'login', { username: 'admin', password: PASSWORD })).data.token;
  const t = await call(admin, 'todaySchedules', { date: today });
  assertEquals(t.data.rows.find((r: any) => r.schedule_id === 'SCH-OLD').status, 'MISSED');
  assertEquals((await rows('schedule')).find((s) => s.schedule_id === 'SCH-OLD').status, 'OPEN');
  await markMissed();
  const s = (await rows('schedule')).find((x) => x.schedule_id === 'SCH-OLD');
  assertEquals([s.status, s.closed_at], ['MISSED', s.close_at]);
});
