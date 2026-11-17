import { assert, assertEquals } from 'jsr:@std/assert@1';
import { BASE_FIXTURE, call, PASSWORD, seed, svc } from './api_helpers.ts';
import { addDays, opDate, ts } from '../supabase/functions/api/lib/util.ts';

const now = new Date();
const today = opDate(now), d1 = addDays(today, -1), d2 = addDays(today, -2);
const T = 'TRUE';
const PHOTO_ID = 'PHMONITORINGTEST0000001';
const DRIVE = 'https://drive.google.com/open?id=OLDPHOTO';
const at = (day: string, hhmm: string) => day + ' ' + hhmm + ':00';
const sch = (day: string, asset: string, code: string, status: string, open: string, close: string, checklist = '') => ({
  schedule_id: 'SCH-' + day.replace(/-/g, '') + '-' + asset + '-' + (code || 'D'), asset_id: asset, operational_date: day, shift_code: code,
  open_at: open, close_at: close, status, checklist_id: checklist, closed_at: '', processed_at: '' });
const head = (id: string, day: string, asset: string, name: string, code: string, ok: string, nok: string) => ({
  checklist_id: id, schedule_id: '', asset_id: asset, asset_name_snapshot: name, operational_date: day, shift_code: code, checker_person_id: 'PRS-PIC1',
  checker_name_snapshot: 'Budi', checker_role: 'PIC', submitted_at: at(day, '09:00'), ok_count: ok, nok_count: nok, overall_result: nok === '0' ? 'OK' : 'NO OK' });
const det = (id: string, cl: string, cp: string, result: string, photoId: string, photoUrl: string) => ({
  detail_id: id, checklist_id: cl, checkpoint_id: cp, point_name_snapshot: 'Point ' + cp, result, photo_file_id: photoId, photo_url: photoUrl,
  finding_note: result === 'NO OK' ? 'rusak' : '', case_id: result === 'NO OK' ? 'CASE-A' : '', case_item_id: '', recorded_at: at(d2, '09:00') });

const SCHEDULES = [
  sch(d2, 'AST-DAILY', '', 'DONE', at(d2, '07:00'), at(addDays(d2, 1), '07:00'), 'CL-1'),
  sch(d1, 'AST-DAILY', '', 'MISSED', at(d1, '07:00'), at(today, '07:00')),
  sch(today, 'AST-DAILY', '', 'OPEN', ts(new Date(now.getTime() - 36e5)), ts(new Date(now.getTime() + 36e5))),
  sch(d1, 'AST-SHIFT', '1', 'DONE', at(d1, '07:00'), at(d1, '15:00'), 'CL-2'),
  sch(d1, 'AST-SHIFT', '2', 'MISSED', at(d1, '15:00'), at(d1, '23:00')),
];
const FIXTURE = { ...BASE_FIXTURE,
  system_settings: [
    { setting_key: 'ACTIVATED_AT', setting_value: at(d2, '00:00'), updated_at: '', updated_by: 'TEST' },
    { setting_key: 'LAST_GEN_DATE', setting_value: today, updated_at: '', updated_by: 'TEST' }, // cegah pembangkitan jadwal tambahan
  ],
  schedule: SCHEDULES,
  checklist_header: [head('CL-1', d2, 'AST-DAILY', 'Alat Harian', '', '1', '2'), head('CL-2', d1, 'AST-SHIFT', 'Alat Shift', '1', '2', '0')],
  checklist_detail: [
    det('DT-1', 'CL-1', 'CP-1', 'NO OK', '', DRIVE), det('DT-2', 'CL-1', 'CP-2', 'NO OK', PHOTO_ID, ''), det('DT-3', 'CL-1', 'CP-3', 'OK', '', ''),
    det('DT-4', 'CL-2', 'CP-4', 'OK', '', ''), det('DT-5', 'CL-2', 'CP-5', 'OK', '', ''),
  ],
  repair_case: [
    { case_id: 'CASE-A', asset_id: 'AST-DAILY', asset_name_snapshot: 'Alat Harian', opened_at: at(d2, '09:00'), status: 'MENUNGGU_SPV', first_finding_at: at(d2, '09:00'),
      last_activity_at: at(d1, '09:00'), closed_at: '', rework_count: '0', cycle_no: '1' },
    { case_id: 'CASE-B', asset_id: 'AST-SHIFT', asset_name_snapshot: 'Alat Shift', opened_at: at(d2, '10:00'), status: 'SELESAI', first_finding_at: at(d2, '10:00'),
      last_activity_at: at(today, '08:00'), closed_at: ts(new Date(now.getTime() - 36e5)), rework_count: '0', cycle_no: '1' },
  ],
  repair_item: [
    { case_item_id: 'CI-1', case_id: 'CASE-A', checkpoint_id: 'CP-1', point_name_snapshot: 'Point CP-1', department: 'MAINTENANCE', status: 'DONE', claimed_by_person_id: 'PRS-MNT1',
      claimed_by_name_snapshot: 'Maman', repair_action: 'ganti', started_at: at(d2, '10:00'), completed_at: at(d2, '12:00'), after_photo_file_id: '', occurrence_count: '1',
      first_detail_id: 'DT-1', last_detail_id: 'DT-1', rework_count: '0', last_reject_note: '', created_at: at(d2, '09:00') },
    { case_item_id: 'CI-2', case_id: 'CASE-B', checkpoint_id: 'CP-5', point_name_snapshot: 'Point CP-5', department: 'MAINTENANCE', status: 'DONE', claimed_by_person_id: '',
      claimed_by_name_snapshot: '', repair_action: '', started_at: '', completed_at: '', after_photo_file_id: '', occurrence_count: '1',
      first_detail_id: '', last_detail_id: '', rework_count: '0', last_reject_note: '', created_at: at(d2, '10:00') },
  ],
};
const eff = SCHEDULES.map((s) => s.status);
const nDone = eff.filter((s) => s === 'DONE').length, nMissed = eff.filter((s) => s === 'MISSED').length, nOpen = eff.filter((s) => s === 'OPEN').length;

let tok: string;
Deno.test('setup: fixture 3 hari + foto baru di bucket', async () => {
  await seed(FIXTURE);
  const up = await svc.storage.from('photos').upload(PHOTO_ID, new Uint8Array([255, 216, 255, 224]), { contentType: 'image/jpeg', upsert: true });
  assertEquals(up.error, null);
  const r = await call(null, 'login', { username: 'spv', password: PASSWORD });
  tok = r.data.token;
  assert(tok);
});

Deno.test('lookups', async () => {
  const r = await call(tok, 'lookups');
  assert(r.success, r.message);
  assertEquals(r.data.opDate, today);
  assert(['1', '2', '3'].includes(r.data.shift));
  assertEquals([r.data.pendingSpv, r.data.pendingHead, r.data.assets.length], [1, 0, 2]);
  assertEquals([r.data.dataFrom, r.data.dataTo], [d2, today]);
  assertEquals(r.data.pics.map((p: any) => p.name).sort(), ['Agus', 'Budi']);
});

Deno.test('dashboard: KPI sesuai fixture, trend sesuai gran', async () => {
  const r = await call(tok, 'dashboard', { from: d2, to: today });
  assert(r.success, r.message);
  const k = r.data.kpi;
  assertEquals([k.scheduled, k.done, k.missed, k.open], [SCHEDULES.length, nDone, nMissed, nOpen]);
  assertEquals(k.compliance, Math.round(nDone / (nDone + nMissed) * 1000) / 10);
  assertEquals([k.nok_events, k.wait_spv, k.closed, k.assets], [2, 1, 1, 2]);
  assertEquals(r.data.period.from, d2);
  assertEquals([r.data.gran, r.data.trend.length], ['D', 3]);
  assertEquals(r.data.trend.map((t: any) => t.date), [d2, d1, today]);
  assertEquals(r.data.trend[0].nok, 2);
  assertEquals(r.data.shiftComp.find((s: any) => s.shift === '1').done, 1);
  assertEquals(r.data.shiftComp.find((s: any) => s.shift === '2').missed, 1);
  assertEquals(r.data.oldest.map((o: any) => o.case_id), ['CASE-A']);
  assertEquals(r.data.deptPerf.length, 3);
  const single = await call(tok, 'dashboard', { from: today, to: today });
  assertEquals(single.data.trend.length, 14);
  for (const gran of ['W', 'M']) {
    const g = await call(tok, 'dashboard', { from: d2, to: today, gran });
    assert(g.success && g.data.gran === gran && g.data.trend.length >= 1 && g.data.trend.length <= 2, gran);
  }
});

Deno.test('kanban: 7 kolom berurutan', async () => {
  const r = await call(tok, 'kanban', { date: d1 });
  assert(r.success, r.message);
  assertEquals(r.data.columns.map((c: any) => c.key), ['BELUM', 'CEK_OK', 'PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI', 'MENUNGGU_SPV', 'MENUNGGU_HEAD', 'SELESAI']);
  const n = Object.fromEntries(r.data.columns.map((c: any) => [c.key, c.cards.length]));
  assertEquals([r.data.date, r.data.missed, n.BELUM, n.CEK_OK, n.MENUNGGU_SPV, n.SELESAI], [d1, 2, 0, 1, 1, 1]);
});

Deno.test('report: semua jenis berhasil', async () => {
  for (const type of ['checklist', 'missed', 'findings', 'repairs', 'approvals', 'pic', 'dept', 'age']) {
    const r = await call(tok, 'report', { type, from: d2, to: today });
    assert(r.success, type + ': ' + r.message);
    assert(r.data.columns.length > 0, type);
    assertEquals([r.data.page, r.data.size, Object.keys(r.data.types).length], [1, 50, 8]);
  }
  assertEquals((await call(tok, 'report', { type: 'checklist', from: d2, to: today })).data.total, SCHEDULES.length);
  const bad = await call(tok, 'report', { type: 'x' });
  assertEquals([bad.success, bad.message], [false, 'Jenis laporan tidak dikenal']);
});

Deno.test('report findings all: foto baru signed URL, foto lama tautan Drive, audit export', async () => {
  const r = await call(tok, 'report', { type: 'findings', from: d2, to: today, all: true, format: 'xlsx' });
  assert(r.success, r.message);
  assertEquals([r.data.total, r.data.rows.length, r.data.filter_text], [2, 2, 'Tanpa filter']);
  assert(r.data.generated_at);
  const links = r.data.rows.map((x: any) => x[9]).sort();
  assertEquals(links[0], DRIVE);
  assert(links[1].startsWith('http') && links[1].includes(PHOTO_ID) && links[1].includes('token='), links[1]);
  const a = (await svc.from('audit_log').select('*').eq('action', 'EXPORT_XLSX')).data!;
  assertEquals([a.length, a[0].entity_id], [1, 'findings']);
  const noFormat = await call(tok, 'report', { type: 'findings', from: d2, to: today, all: true });
  assertEquals(noFormat.success, true);
  assertEquals((await svc.from('audit_log').select('audit_id').like('action', 'EXPORT_%')).data!.length, 1);
});

Deno.test('exportReport: NOT_FOUND', async () => {
  const r = await call(tok, 'exportReport', { type: 'checklist' });
  assertEquals([r.success, r.code, r.message], [false, 'NOT_FOUND', 'Export dibuat di browser']);
});
