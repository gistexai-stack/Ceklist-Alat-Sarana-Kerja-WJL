import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { BASE_FIXTURE, call, PASSWORD, seed, svc } from './api_helpers.ts';
import { notify } from '../supabase/functions/api/lib/notify.ts';
import { EDITABLE_SETTINGS } from '../supabase/functions/api/lib/settings.ts';

const rows = async (t: string) => (await svc.from(t).select('*')).data as any[];
const login = async (u: string, p = PASSWORD) => (await call(null, 'login', { username: u, password: p })).data?.token as string;
const vaultToken = async () => (await svc.rpc('get_fonnte_token')).data as string | null;

Deno.test('masterData: non-admin ditolak, admin lihat aset+checkpoint tanpa hash/salt', async () => {
  await seed(BASE_FIXTURE);
  const spv = await login('spv'), admin = await login('admin');
  const bad = await call(spv, 'masterData');
  assertEquals([bad.success, bad.code], [false, 'FORBIDDEN']);
  const r = await call(admin, 'masterData');
  assertEquals(r.success, true);
  assertEquals(r.data.assets.length, 2);
  assertEquals(r.data.assets.find((a: any) => a.asset_id === 'AST-DAILY').checkpoints.map((c: any) => c.checkpoint_id), ['CP-1', 'CP-2', 'CP-3']);
  assertEquals(r.data.accounts.length, 3);
  assert(r.data.accounts.every((a: any) => !('password_hash' in a) && !('salt' in a)));
  assertEquals([r.data.ready.ok, r.data.activated], [true, false]);
});

Deno.test('saveAsset: alat baru 2 checkpoint -> ID CHK-006/007, GEN_DIRTY, validasi', async () => {
  await seed(BASE_FIXTURE);
  const admin = await login('admin');
  const asset = { asset_name: ' Alat Baru ', schedule_type: 'DAILY', checker_role: 'PIC', pic_ids: ['PRS-PIC1', 'PRS-MNT1'] };
  const none = await call(admin, 'saveAsset', { asset, checkpoints: [] });
  assertEquals([none.success, none.message], [false, 'Alat aktif wajib punya minimal satu checkpoint aktif']);
  const r = await call(admin, 'saveAsset', { asset, checkpoints: [{ point_name: 'Oli', repair_department: 'MAINTENANCE' }, { point_name: 'Baut', repair_department: 'UTILITY', target_label: '1 MENIT' }] });
  assertEquals([r.success, r.data.asset_id], [true, 'AST-003']);
  const m = (await call(admin, 'masterData')).data;
  assertEquals(m.assets.length, 3);
  const a = m.assets.find((x: any) => x.asset_id === 'AST-003');
  assertEquals([a.asset_name, a.pic_ids], ['Alat Baru', 'PRS-PIC1']); // non-PIC disaring
  assertEquals(a.checkpoints.map((c: any) => [c.checkpoint_id, c.display_order, c.target_label]), [['CHK-006', '1', '2 MENIT'], ['CHK-007', '2', '1 MENIT']]);
  const st = await rows('system_settings');
  assertEquals(st.find((x) => x.setting_key === 'LAST_GEN_DATE') !== undefined, true); // ensureSchedules(true) jalan
  assert((await rows('audit_log')).some((x) => x.action === 'CREATE_ASSET' && x.entity_id === 'AST-003'));
  // nonaktifkan -> jadwal terbuka BATAL
  const sch = (await rows('schedule')).filter((s) => s.asset_id === 'AST-003');
  assert(sch.length > 0 && sch.every((s) => s.status === 'OPEN'));
  const off = await call(admin, 'saveAsset', { asset: { ...asset, asset_id: 'AST-003', pic_ids: ['PRS-PIC1'], active: false }, checkpoints: a.checkpoints });
  assertEquals(off.success, true);
  assert((await rows('schedule')).filter((s) => s.asset_id === 'AST-003').every((s) => s.status === 'BATAL'));
});

Deno.test('saveAccount: username duplikat gagal, akun baru bisa login, resetPassword', async () => {
  await seed(BASE_FIXTURE);
  const admin = await login('admin');
  const dup = await call(admin, 'saveAccount', { username: 'SPV', role: 'SPV', password: 'abcdef' });
  assertEquals([dup.success, dup.message], [false, 'Username sudah dipakai']);
  const ok = await call(admin, 'saveAccount', { username: 'Baru.1', display_name: 'Baru', role: 'SPV', password: 'abcdef' });
  assertEquals([ok.success, ok.data.account_id, ok.data.username, 'password_hash' in ok.data], [true, 'ACC-004', 'baru.1', false]);
  assertNotEquals(await login('baru.1', 'abcdef'), undefined);
  const self = await call(admin, 'saveAccount', { account_id: 'ACC-ADMIN', username: 'admin', role: 'SPV' });
  assertEquals(self.message, 'Tidak bisa menonaktifkan / menurunkan role akun sendiri');
  assertEquals((await call(admin, 'resetPassword', { account_id: 'ACC-004', password: '123' })).message, 'Password minimal 6 karakter');
  assertEquals((await call(admin, 'resetPassword', { account_id: 'ACC-004', password: 'zzzzzz' })).data, true);
  assertEquals(await login('baru.1', 'abcdef'), undefined);
  assertNotEquals(await login('baru.1', 'zzzzzz'), undefined);
  assertEquals((await call(admin, 'auditLog')).data.some((a: any) => a.action === 'RESET_PASSWORD'), true);
});

Deno.test('savePerson: nama di-uppercase, duplikat aktif ditolak', async () => {
  await seed(BASE_FIXTURE);
  const admin = await login('admin');
  const r = await call(admin, 'savePerson', { display_name: ' joko ', role_type: 'MAINTENANCE' });
  assertEquals([r.success, r.data.person_id, r.data.display_name], [true, 'PRS-005', 'JOKO']);
  assertEquals((await call(admin, 'savePerson', { display_name: 'Joko', role_type: 'MAINTENANCE' })).message, 'Nama sudah terdaftar aktif pada role MAINTENANCE');
  assertEquals((await call(admin, 'savePerson', { person_id: 'PRS-PIC1', display_name: 'Budi', role_type: 'UTILITY' })).message,
    'Orang ini masih menjadi PIC alat. Lepaskan dari alat sebelum mengganti role.');
});

Deno.test('saveFonnteToken + settings: token tersamar, Vault terisi, dipulihkan', async () => {
  await seed(BASE_FIXTURE);
  const orig = await vaultToken();
  try {
    const admin = await login('admin');
    const r = await call(admin, 'saveFonnteToken', { token: 'tok123456' });
    assertEquals(r.data.token_masked, '••••••••3456');
    assertEquals(await vaultToken(), 'tok123456');
    const s = (await call(admin, 'settings')).data;
    assertEquals(s.token_masked, '••••••••3456');
    assert(!JSON.stringify(s).includes('tok123456'));
    assert(/^https:\/\/supabase\.com\/dashboard\/project\/[a-z0-9]+\/storage\/buckets$/.test(s.root_folder_url));
    assertEquals(Object.keys(s.values).length, EDITABLE_SETTINGS.length);
    assertEquals((await call(admin, 'saveSettings', { values: { PHOTO_MAX_KB: '10' } })).message, 'Batas foto 200–20480 KB');
    await call(admin, 'saveSettings', { values: { NOTIF_NOK: 'x', NOK_FORMAT: 'ASSET', ACTIVATED_AT: 'hack' } });
    const s2 = (await call(admin, 'settings')).data;
    assertEquals([s2.values.NOTIF_NOK, s2.values.NOK_FORMAT, s2.activated_at], ['FALSE', 'ASSET', '']);
  } finally {
    await svc.rpc('set_fonnte_token', { p_token: orig ?? '' });
  }
  assertEquals(await vaultToken(), orig);
});

Deno.test('notify: WA_GROUPS kosong -> FAILED "Group ID belum diatur"; event_id sama -> 1 baris; NOTIF mati -> tidak ada', async () => {
  await seed({ ...BASE_FIXTURE, system_settings: [{ setting_key: 'NOTIF_DONE', setting_value: 'FALSE', updated_at: '', updated_by: 'TEST' }] });
  await notify('NOK', 'EV-1', { alat: 'A', checkpoint: 'C', pic: 'P', waktu: 'W', kasus: 'K', link: 'L' });
  await notify('NOK', 'EV-1', { alat: 'B' });
  await notify('DONE', 'EV-2', {});
  const log = await rows('notification_log');
  assertEquals(log.length, 1);
  assertEquals([log[0].status, log[0].provider_response, log[0].attempt_count, log[0].event_type], ['FAILED', 'Group ID belum diatur', '1', 'NOK']);
  assert(log[0].message.includes('Alat: A'));
  const admin = await login('admin');
  const nl = (await call(admin, 'notifLog')).data;
  assertEquals([nl.length, 'message' in nl[0]], [1, false]);
  const rt = await call(admin, 'retryNotif', {});
  assertEquals(rt.data, { tried: 1, sent: 0 });
  assertEquals((await rows('notification_log'))[0].attempt_count, '2');
});

Deno.test('pembuatan bersamaan: dua savePerson -> keduanya ada, ID berbeda, tidak ada yang tertimpa', async () => {
  await seed(BASE_FIXTURE);
  const admin = await login('admin');
  const res = await Promise.all([call(admin, 'savePerson', { display_name: 'Satu', role_type: 'UTILITY' }), call(admin, 'savePerson', { display_name: 'Dua', role_type: 'UTILITY' })]);
  const names = (await rows('master_person')).map((p) => p.display_name);
  for (const [i, n] of ['SATU', 'DUA'].entries()) assert(res[i].success ? names.includes(n) : res[i].code === 'CONFLICT');
  assert(res.some((r) => r.success));
  assertEquals(new Set(res.filter((r) => r.success).map((r) => r.data.person_id)).size, res.filter((r) => r.success).length);
  assertEquals(names.length, 4 + res.filter((r) => r.success).length);
});

Deno.test('notify bersamaan dengan event_id sama -> tepat 1 baris', async () => {
  await seed(BASE_FIXTURE);
  await Promise.all([1, 2, 3].map(() => notify('NOK', 'EV-RACE', { alat: 'A' })));
  assertEquals((await rows('notification_log')).length, 1);
});

Deno.test('saveAsset baru gagal di checkpoint -> alat baru dibatalkan (tidak ada alat aktif tanpa checkpoint)', async () => {
  // CHK-007 sudah ada dan jumlah checkpoint 6 -> id berikutnya selalu CHK-007 (bentrok PK 3x -> CONFLICT)
  const stray = { checkpoint_id: 'CHK-007', asset_id: 'AST-DAILY', point_name: 'x', display_order: '9', target_label: '', repair_department: 'UTILITY', active: 'FALSE', created_at: '', updated_at: '' };
  await seed({ ...BASE_FIXTURE, master_checkpoint: [...BASE_FIXTURE.master_checkpoint, stray] });
  const admin = await login('admin');
  const r = await call(admin, 'saveAsset', { asset: { asset_name: 'Gagal', schedule_type: 'DAILY', checker_role: 'UTILITY' }, checkpoints: [{ point_name: 'P', repair_department: 'UTILITY' }] });
  assertEquals([r.success, r.code], [false, 'CONFLICT']);
  assertEquals((await rows('master_asset')).map((a) => a.asset_id).sort(), ['AST-DAILY', 'AST-SHIFT']);
  assertEquals((await rows('master_checkpoint')).length, 6);
});

Deno.test('saveAccount bersamaan dengan username sama -> satu akun, satunya "Username sudah dipakai"', async () => {
  await seed(BASE_FIXTURE);
  const admin = await login('admin');
  const a = (n: string) => call(admin, 'saveAccount', { username: 'kembar', display_name: n, role: 'SPV', password: 'abcdef' });
  const res = await Promise.all([a('A'), a('B')]);
  assertEquals((await rows('master_account')).filter((x) => x.username === 'kembar').length, 1);
  assertEquals(res.filter((x) => x.success).length, 1);
  assertEquals(res.find((x) => !x.success)!.message, 'Username sudah dipakai');
});
