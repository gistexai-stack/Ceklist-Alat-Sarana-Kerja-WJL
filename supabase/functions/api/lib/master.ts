import { hash } from './auth.ts';
import { db, selectAll, updateWhere, upsertRows } from './db.ts';
import { ensureSchedules, isMasterReady } from './schedule.ts';
import { audit, setSetting, settings } from './settings.ts';
import type { RouteFn } from './types.ts';
import { clean, DEPTS, err, GUEST, ids, LOGGED, num, pad, ts } from './util.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Audit pasca-commit: kegagalan audit tidak boleh mengubah tulisan yang sudah commit menjadi error. */
export async function safeAudit(...a: Parameters<typeof audit>): Promise<void> {
  try { await audit(...a); } catch (e) { console.error('audit ' + a[1] + ': ' + e); }
}
const regen = () => ensureSchedules(true).catch((e) => console.error('ensureSchedules: ' + e));
/** Insert baris baru dengan id count+1; tabrakan PK (23505, pembuat lain bersamaan) dihitung ulang, maks 3x. */
async function insertNew(table: string, mk: (count: number) => Row[], dupMsg = 'Data sudah ada'): Promise<Row[]> {
  for (let i = 0; i < 3; i++) {
    const rows = mk((await selectAll(table)).length);
    if (!rows.length) return rows;
    const { error } = await db.from(table).insert(rows);
    if (!error) return rows;
    if (error.code !== '23505') throw new Error('insert ' + table + ': ' + error.message);
    if (!error.message.includes(table + '_pkey')) throw err(dupMsg); // unique index lain (mis. username): jangan di-retry
  }
  throw err('Terjadi bentrokan ID saat menyimpan. Coba lagi.', 'CONFLICT');
}
const isFalse = (v: unknown) => v === false || v === 'FALSE';

const masterData: RouteFn = async () => {
  const cps = await selectAll('master_checkpoint');
  return {
    assets: (await selectAll('master_asset')).map((a) => ({
      ...clean(a), checkpoints: cps.filter((c) => c.asset_id === a.asset_id).sort((x, y) => num(x.display_order) - num(y.display_order)).map(clean),
    })),
    persons: (await selectAll('master_person')).map(clean),
    accounts: (await selectAll('master_account')).map(clean),
    ready: await isMasterReady(),
    activated: !!(await settings()).ACTIVATED_AT,
  };
};

const saveAsset: RouteFn = async (s, a) => {
  const nowStr = ts(), activated = !!(await settings()).ACTIVATED_AT;
  const A = await selectAll('master_asset'), C = await selectAll('master_checkpoint');
  const P = Object.fromEntries((await selectAll('master_person')).map((p) => [p.person_id, p]));
  const x = a.asset || {};
  const name = String(x.asset_name || '').trim();
  if (!name) throw err('Nama alat wajib diisi');
  if (!['DAILY', 'SHIFT'].includes(x.schedule_type)) throw err('Jenis jadwal tidak valid');
  if (!['PIC', 'UTILITY'].includes(x.checker_role)) throw err('Pemeriksa tidak valid');
  const picIds = (x.pic_ids || []).filter((id: string) => P[id] && P[id].role_type === 'PIC');
  if (x.checker_role === 'PIC' && !picIds.length) throw err('Pilih minimal satu PIC untuk alat ini');
  let row: Row | undefined = x.asset_id ? A.find((r) => r.asset_id === x.asset_id) : undefined;
  const before = row ? clean(row) : null;
  const isNew = !row;
  if (!row) row = { source_no: '', created_at: nowStr, activated_at: nowStr };
  const wasActive = row.active === 'TRUE';
  Object.assign(row, { asset_name: name, active: isFalse(x.active) ? 'FALSE' : 'TRUE', schedule_type: x.schedule_type,
    pic_group: String(x.pic_group || '').trim(), checker_role: x.checker_role, pic_ids: x.checker_role === 'PIC' ? picIds.join(',') : '', updated_at: nowStr });
  if (!isNew && !wasActive && row.active === 'TRUE') row.activated_at = nowStr;
  const list: Row[] = a.checkpoints || [];
  if (row.active === 'TRUE' && !list.some((c) => !isFalse(c.active))) throw err('Alat aktif wajib punya minimal satu checkpoint aktif');
  const upd: Row[] = [], add: Row[] = [];
  list.forEach((c, idx) => {
    const pn = String(c.point_name || '').trim();
    if (!pn) throw err('Nama point pemeriksaan tidak boleh kosong (baris ' + (idx + 1) + ')');
    const dept = DEPTS.includes(c.repair_department) ? c.repair_department : '';
    const act = isFalse(c.active) ? 'FALSE' : 'TRUE';
    if (activated && act === 'TRUE' && !dept) throw err('Departemen perbaikan wajib diisi untuk "' + pn + '" (sistem sudah aktif)');
    const vals = { point_name: pn, display_order: String(idx + 1), target_label: ['1 MENIT', '2 MENIT'].includes(c.target_label) ? c.target_label : '2 MENIT',
      repair_department: dept, active: act, updated_at: nowStr };
    const ex = c.checkpoint_id ? C.find((r) => r.checkpoint_id === c.checkpoint_id && r.asset_id === row!.asset_id) : null;
    if (ex) upd.push({ ...ex, ...vals });
    else add.push({ created_at: nowStr, ...vals });
  });
  if (isNew) row = (await insertNew('master_asset', (n) => [{ ...row, asset_id: 'AST-' + pad(n + 1, 3) }]))[0];
  else await upsertRows('master_asset', [row]);
  try {
    await upsertRows('master_checkpoint', upd);
    await insertNew('master_checkpoint', (n) => add.map((c, i) => ({ ...c, checkpoint_id: 'CHK-' + pad(n + i + 1, 3), asset_id: row!.asset_id })));
  } catch (e) {
    if (isNew) { // tanpa transaksi: batalkan alat baru agar tidak tersisa alat aktif tanpa checkpoint
      await db.from('master_checkpoint').delete().eq('asset_id', row.asset_id);
      await db.from('master_asset').delete().eq('asset_id', row.asset_id);
    }
    throw e;
  }
  if (wasActive && row.active === 'FALSE') { // batalkan jadwal terbuka alat yang dinonaktifkan
    const { error } = await db.from('schedule').update({ status: 'BATAL', processed_at: nowStr }).match({ asset_id: row.asset_id, status: 'OPEN' });
    if (error) throw new Error('cancel schedule: ' + error.message);
  }
  await setSetting('GEN_DIRTY', 'TRUE', s!.name);
  await safeAudit(s, isNew ? 'CREATE_ASSET' : 'UPDATE_ASSET', 'MASTER_ASSET', row.asset_id, before, { asset: clean(row), checkpoints: list.length });
  await regen();
  return { asset_id: row.asset_id };
};

const saveMapping: RouteFn = async (s, a) => {
  const C = await selectAll('master_checkpoint'), activated = !!(await settings()).ACTIVATED_AT, nowStr = ts();
  const changed: { id: string; from: string; to: string }[] = [], patch: Row[] = [];
  for (const ch of a.changes || []) {
    const c = C.find((r) => r.checkpoint_id === ch.checkpoint_id);
    if (!c) continue;
    const dept = DEPTS.includes(ch.dept) ? ch.dept : '';
    if (activated && !dept && c.active === 'TRUE') throw err('Mapping tidak boleh dikosongkan setelah sistem aktif (' + c.checkpoint_id + ')');
    if (c.repair_department !== dept) {
      changed.push({ id: c.checkpoint_id, from: c.repair_department, to: dept });
      patch.push({ ...c, repair_department: dept, updated_at: nowStr });
    }
  }
  await upsertRows('master_checkpoint', patch);
  if (changed.length) {
    await setSetting('GEN_DIRTY', 'TRUE', s!.name);
    await safeAudit(s, 'UPDATE_MAPPING', 'MASTER_CHECKPOINT', changed.length + ' checkpoint', null, changed);
  }
  await regen();
  return { changed: changed.length, ready: await isMasterReady() };
};

const savePerson: RouteFn = async (s, a) => {
  const T = await selectAll('master_person'), nowStr = ts();
  const name = String(a.display_name || '').trim().toUpperCase();
  if (!name) throw err('Nama wajib diisi');
  if (!GUEST.includes(a.role_type)) throw err('Role tidak valid');
  if (T.some((r) => r.person_id !== a.person_id && r.role_type === a.role_type && r.display_name.toUpperCase() === name && r.active === 'TRUE'))
    throw err('Nama sudah terdaftar aktif pada role ' + a.role_type);
  let p: Row | undefined = a.person_id ? T.find((r) => r.person_id === a.person_id) : undefined;
  const before = p ? clean(p) : null;
  if (p) {
    if (p.role_type !== a.role_type && p.role_type === 'PIC' && (await selectAll('master_asset')).some((x) => ids(x.pic_ids).includes(p!.person_id)))
      throw err('Orang ini masih menjadi PIC alat. Lepaskan dari alat sebelum mengganti role.');
    p = { ...p, display_name: name, role_type: a.role_type, active: a.active === false ? 'FALSE' : 'TRUE', updated_at: nowStr };
  } else {
    const base = { display_name: name, role_type: a.role_type, active: 'TRUE', created_at: nowStr, updated_at: nowStr };
    p = (await insertNew('master_person', (n) => [{ person_id: 'PRS-' + pad(n + 1, 3), ...base }]))[0];
  }
  if (before) await upsertRows('master_person', [p]);
  await safeAudit(s, before ? 'UPDATE_PERSON' : 'CREATE_PERSON', 'MASTER_PERSON', p.person_id, before, clean(p));
  return clean(p);
};

const saveAccount: RouteFn = async (s, a) => {
  const T = await selectAll('master_account'), nowStr = ts();
  const username = String(a.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw err('Username 3–30 karakter (huruf kecil, angka, titik, minus, garis bawah)');
  if (!LOGGED.includes(a.role)) throw err('Role akun tidak valid');
  if (T.some((r) => r.username === username && r.account_id !== a.account_id)) throw err('Username sudah dipakai');
  let acc: Row | undefined = a.account_id ? T.find((r) => r.account_id === a.account_id) : undefined;
  const before = acc ? clean(acc) : null;
  const active = a.active === false ? 'FALSE' : 'TRUE';
  const display_name = String(a.display_name || username).trim();
  if (acc) {
    if (acc.account_id === s!.account_id && (active === 'FALSE' || a.role !== 'ADMIN')) throw err('Tidak bisa menonaktifkan / menurunkan role akun sendiri');
    acc = { ...acc, username, display_name, role: a.role, active, updated_at: nowStr };
  } else {
    if (String(a.password || '').length < 6) throw err('Password awal minimal 6 karakter');
    const salt = crypto.randomUUID();
    const base = { username, display_name, role: a.role, password_hash: await hash(a.password, salt), salt, active: 'TRUE', last_login_at: '', created_at: nowStr, updated_at: nowStr };
    acc = (await insertNew('master_account', (n) => [{ account_id: 'ACC-' + pad(n + 1, 3), ...base }], 'Username sudah dipakai'))[0];
  }
  if (before) await upsertRows('master_account', [acc]);
  await safeAudit(s, before ? 'UPDATE_ACCOUNT' : 'CREATE_ACCOUNT', 'MASTER_ACCOUNT', acc.account_id, before, clean(acc));
  return clean(acc);
};

const resetPassword: RouteFn = async (s, a) => {
  if (String(a.password || '').length < 6) throw err('Password minimal 6 karakter');
  const acc = (await selectAll('master_account', (q) => q.eq('account_id', String(a.account_id))))[0];
  if (!acc) throw err('Akun tidak ditemukan', 'NOT_FOUND');
  const salt = crypto.randomUUID();
  await updateWhere('master_account', { salt, password_hash: await hash(a.password, salt), updated_at: ts() }, { account_id: acc.account_id });
  await safeAudit(s, 'RESET_PASSWORD', 'MASTER_ACCOUNT', acc.account_id, null, null, 'Reset oleh Admin');
  return true;
};

const auditLog: RouteFn = async () => {
  const { data, error } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error('auditLog: ' + error.message);
  return data.map(clean);
};

export const MASTER_ROUTES = { masterData, saveAsset, saveMapping, savePerson, saveAccount, resetPassword, auditLog };
