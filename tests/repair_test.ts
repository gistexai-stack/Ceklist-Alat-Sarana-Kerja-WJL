import { assert, assertEquals } from 'jsr:@std/assert@1';
import { BASE_FIXTURE, call, PASSWORD, seed, svc } from './api_helpers.ts';
import { opDate, ts } from '../supabase/functions/api/lib/util.ts';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const now = new Date();
const today = opDate(now);
const T = 'TRUE';
const rows = async (t: string) => (await svc.from(t).select('*')).data as any[];
const guest = async (role: string, person_id: string) => (await call(null, 'guestLogin', { role, person_id })).data.token as string;
const login = async (u: string) => (await call(null, 'login', { username: u, password: PASSWORD })).data.token as string;
const extraSchedule = (id: string) => ({ schedule_id: id, asset_id: 'AST-DAILY', operational_date: today, shift_code: '', open_at: ts(new Date(now.getTime() - 36e5)),
  close_at: ts(new Date(now.getTime() + 36e5)), status: 'OPEN', checklist_id: '', closed_at: '', processed_at: '' });
const item = async (cp: string, caseId: string) => (await rows('repair_item')).find((i) => i.checkpoint_id === cp && i.case_id === caseId);
const caseRow = async (id: string) => (await rows('repair_case')).find((c) => c.case_id === id);
async function submitNok(tok: string, scheduleId: string, nok: string[]) {
  const form = (await call(tok, 'checklistForm', { schedule_id: scheduleId })).data;
  const results = form.points.map((p: any) => nok.includes(p.checkpoint_id) ? { checkpoint_id: p.checkpoint_id, result: 'NO OK', photo: JPEG, note: 'rusak' } : { checkpoint_id: p.checkpoint_id, result: 'OK' });
  return await call(tok, 'submitChecklist', { schedule_id: scheduleId, results });
}

let pic: string, m1: string, m2: string, utl: string, spv: string, head: string;
const dailyId = 'SCH-' + today.replace(/-/g, '') + '-AST-DAILY-D';

Deno.test('setup: kasus dari NO OK pada CP-1, CP-2, CP-3', async () => {
  await seed({ ...BASE_FIXTURE,
    system_settings: [{ setting_key: 'ACTIVATED_AT', setting_value: ts(new Date(now.getTime() - 864e5)), updated_at: '', updated_by: 'TEST' }],
    master_person: [...BASE_FIXTURE.master_person, { person_id: 'PRS-MNT2', display_name: 'Maman2', role_type: 'MAINTENANCE', active: T, created_at: '', updated_at: '' }] });
  [pic, m1, m2, utl] = [await guest('PIC', 'PRS-PIC1'), await guest('MAINTENANCE', 'PRS-MNT1'), await guest('MAINTENANCE', 'PRS-MNT2'), await guest('UTILITY', 'PRS-UTL1')];
  [spv, head] = [await login('spv'), await login('head')];
  await call(pic, 'worklist');
  const r = await submitNok(pic, dailyId, ['CP-1', 'CP-2', 'CP-3']);
  assertEquals([r.success, r.data.case_id], [true, 'CASE-00001']);
  const q = await call(m1, 'repairQueue');
  assertEquals(q.data.rows.map((i: any) => i.point_name).sort(), ['Point CP-1', 'Point CP-3']); // MAINTENANCE hanya melihat itemnya
});

Deno.test('klaim: PIC ditolak, dua sesi bersamaan -> tepat satu menang, kasus SEDANG_DIPERBAIKI', async () => {
  const cp1 = await item('CP-1', 'CASE-00001');
  const bad = await call(pic, 'claimItem', { case_item_id: cp1.case_item_id });
  assertEquals([bad.success, bad.code], [false, 'FORBIDDEN']);
  assertEquals(bad.message, 'Item ini bukan antrean departemen Anda');
  const res = await Promise.all([call(m1, 'claimItem', { case_item_id: cp1.case_item_id }), call(m2, 'claimItem', { case_item_id: cp1.case_item_id })]);
  assertEquals(res.filter((r) => r.success).length, 1);
  const lose = res.find((r) => !r.success)!;
  assertEquals(lose.code, 'TAKEN');
  assert(lose.message.startsWith('Pekerjaan sudah diambil oleh '));
  const after = await item('CP-1', 'CASE-00001');
  assertEquals(after.status, 'CLAIMED');
  assertEquals((await caseRow('CASE-00001')).status, 'SEDANG_DIPERBAIKI');
  assertEquals((await rows('repair_log')).filter((l) => l.event === 'CLAIM').length, 1);
  // pemenang disimpan agar langkah berikut memakai sesi yang benar
  if (after.claimed_by_person_id === 'PRS-MNT2') [m1, m2] = [m2, m1];
});

Deno.test('selesaikan: tanpa foto gagal, dengan foto DONE, semua DONE -> MENUNGGU_SPV', async () => {
  const [cp1, cp2, cp3] = await Promise.all(['CP-1', 'CP-2', 'CP-3'].map((c) => item(c, 'CASE-00001')));
  assertEquals((await call(m1, 'claimItem', { case_item_id: cp3.case_item_id })).success, true);
  assertEquals((await call(utl, 'claimItem', { case_item_id: cp2.case_item_id })).success, true);
  const nophoto = await call(m1, 'completeItem', { case_item_id: cp1.case_item_id, action: 'ganti' });
  assertEquals([nophoto.success, nophoto.code], [false, 'PHOTO_REQUIRED']);
  const other = await call(m2, 'completeItem', { case_item_id: cp1.case_item_id, action: 'ganti', photo: JPEG }); // bukan pengklaim
  assertEquals([other.success, other.code], [false, 'FORBIDDEN']);
  for (const [tok, it] of [[m1, cp1], [m1, cp3]] as const) {
    const r = await call(tok, 'completeItem', { case_item_id: it.case_item_id, action: ' ganti part ', photo: JPEG });
    assertEquals([r.success, r.data.case_status], [true, 'SEDANG_DIPERBAIKI']);
  }
  const d1 = await item('CP-1', 'CASE-00001');
  assertEquals([d1.status, d1.repair_action], ['DONE', 'ganti part']);
  assert(d1.after_photo_file_id.length >= 20);
  const last = await call(utl, 'completeItem', { case_item_id: cp2.case_item_id, action: 'setel', photo: JPEG });
  assertEquals([last.success, last.data.case_status], [true, 'MENUNGGU_SPV']);
  assertEquals((await rows('repair_log')).filter((l) => l.event === 'DONE').length, 3);
});

Deno.test('approval: SPV APPROVE -> MENUNGGU_HEAD, cycle lama ditolak, HEAD APPROVE -> SELESAI', async () => {
  assertEquals((await call(spv, 'approvalQueue')).data.rows.map((c: any) => c.case_id), ['CASE-00001']);
  assertEquals((await call(head, 'approvalQueue')).data.rows, []);
  const det = (await call(spv, 'caseDetail', { case_id: 'CASE-00001' })).data;
  assertEquals([det.can_decide, det.level, det.items.length, det.items[0].occurrences.length], [true, 'SPV', 3, 1]);
  const stale = await call(spv, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '0' });
  assertEquals([stale.success, stale.code], [false, 'STALE']);
  const wrong = await call(head, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '1' });
  assertEquals([wrong.success, wrong.code, wrong.message], [false, 'FORBIDDEN', 'Kasus ini menunggu approval SPV']);
  assertEquals((await call(spv, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '1', level: 'SPV' })).data, { status: 'MENUNGGU_HEAD' });
  assertEquals((await call(spv, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '1' })).code, 'FORBIDDEN'); // kini menunggu HEAD
  const done = await call(head, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '1', level: 'HEAD', note: 'ok' });
  assertEquals(done.data, { status: 'SELESAI' });
  assertEquals((await call(head, 'decide', { case_id: 'CASE-00001', decision: 'APPROVE', cycle_no: '1' })).code, 'STATE');
  const c = await caseRow('CASE-00001');
  assertEquals(c.status, 'SELESAI');
  assert(c.closed_at.length > 0);
  assertEquals((await rows('approval')).map((a) => [a.level, a.decision, a.cycle_no]).sort(), [['HEAD', 'APPROVE', '1'], ['SPV', 'APPROVE', '1']]);
  assertEquals((await call(m1, 'caseDetail', { case_id: 'CASE-00001' })).code, 'FORBIDDEN'); // histori hanya LOGGED
});

Deno.test('REJECT dengan item_ids -> item OPEN, rework_count 1, cycle naik, log REOPEN_REJECT; release', async () => {
  await svc.from('schedule').insert(extraSchedule('SCH-X1'));
  assertEquals((await submitNok(pic, 'SCH-X1', ['CP-1', 'CP-3'])).data.case_id, 'CASE-00002');
  const [a, b] = await Promise.all(['CP-1', 'CP-3'].map((c) => item(c, 'CASE-00002')));
  for (const it of [a, b]) {
    await call(m1, 'claimItem', { case_item_id: it.case_item_id });
    assertEquals((await call(m1, 'completeItem', { case_item_id: it.case_item_id, action: 'x', photo: JPEG })).success, true);
  }
  assertEquals((await caseRow('CASE-00002')).status, 'MENUNGGU_SPV');
  const nonote = await call(spv, 'decide', { case_id: 'CASE-00002', decision: 'REJECT', cycle_no: '1', item_ids: [a.case_item_id] });
  assertEquals([nonote.success, nonote.message], [false, 'Catatan penolakan wajib diisi']);
  const noitem = await call(spv, 'decide', { case_id: 'CASE-00002', decision: 'REJECT', cycle_no: '1', note: 'kurang', item_ids: [] });
  assertEquals([noitem.success, noitem.message], [false, 'Pilih minimal satu item yang perlu dikerjakan ulang']);
  const r = await call(spv, 'decide', { case_id: 'CASE-00002', decision: 'REJECT', cycle_no: '1', note: ' belum rapi ', item_ids: [a.case_item_id] });
  assertEquals(r.data, { status: 'SEDANG_DIPERBAIKI' }); // CP-3 masih DONE, CP-1 OPEN -> ada item non-OPEN
  const ra = await item('CP-1', 'CASE-00002'), rb = await item('CP-3', 'CASE-00002');
  assertEquals([ra.status, ra.rework_count, ra.last_reject_note, ra.claimed_by_person_id], ['OPEN', '1', 'belum rapi', '']);
  assertEquals([rb.status, rb.rework_count], ['DONE', '0']);
  const c = await caseRow('CASE-00002');
  assertEquals([c.rework_count, c.cycle_no], ['1', '2']);
  const log = (await rows('repair_log')).filter((l) => l.event === 'REOPEN_REJECT');
  assertEquals([log.length, log[0].case_item_id, log[0].cycle_no], [1, a.case_item_id, '1']);
  const ap = (await rows('approval')).find((x) => x.case_id === 'CASE-00002');
  assertEquals([ap.decision, ap.reopened_items, ap.approver_role], ['REJECT', a.case_item_id, 'SPV']);

  // release: hanya ADMIN/SPV; item kembali OPEN
  await call(m1, 'claimItem', { case_item_id: a.case_item_id });
  assertEquals((await call(m1, 'releaseItem', { case_item_id: a.case_item_id })).code, 'FORBIDDEN');
  assertEquals((await call(head, 'releaseItem', { case_item_id: a.case_item_id })).code, 'FORBIDDEN');
  assertEquals((await call(spv, 'releaseItem', { case_item_id: a.case_item_id, reason: 'cuti' })).data, true);
  assertEquals((await item('CP-1', 'CASE-00002')).status, 'OPEN');
  assertEquals((await rows('repair_log')).find((l) => l.event === 'RELEASE').note, 'Dilepas oleh spv: cuti');
  assertEquals((await call(spv, 'releaseItem', { case_item_id: a.case_item_id })).code, 'STATE');
});

Deno.test('caseList: filter status, total, paging size 25 (sesuai caseList_ Code.gs)', async () => {
  const all = (await call(spv, 'caseList')).data;
  assertEquals([all.total, all.page, all.size, all.rows.length], [2, 1, 25, 2]);
  assertEquals(all.rows[0].case_id, 'CASE-00002'); // belum SELESAI dulu
  assertEquals([all.rows[0].items, all.rows[0].done, all.rows[0].depts], [2, 1, 'MAINTENANCE']);
  const done = (await call(spv, 'caseList', { status: 'SELESAI' })).data;
  assertEquals([done.total, done.rows[0].case_id], [1, 'CASE-00001']);
  assertEquals((await call(spv, 'caseList', { q: 'harian', dept: 'UTILITY' })).data.total, 1);
  assertEquals((await call(spv, 'caseList', { page: 2 })).data.rows, []);
  assertEquals((await call(m1, 'caseList')).code, 'FORBIDDEN');
});
