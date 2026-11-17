import { db, selectAll } from './db.ts';
import { notify } from './notify.ts';
import { savePhoto, trashPhotos } from './photos.ts';
import { checkableAssetIds } from './schedule.ts';
import { audit } from './settings.ts';
import type { RouteFn, Session } from './types.ts';
import { clean, err, hoursBetween, num, ts } from './util.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const byKey = (rows: Row[], k: string) => Object.fromEntries(rows.map((r) => [r[k], r]));

/** Pesan exception SQL (migrasi 20261117000002) -> pesan/kode Code.gs. */
const SQL_ERRORS: [RegExp, (m: RegExpExecArray) => Error][] = [
  [/^ITEM_NOT_FOUND/, () => err('Item perbaikan tidak ditemukan', 'NOT_FOUND')],
  [/^CASE_NOT_FOUND/, () => err('Kasus tidak ditemukan', 'NOT_FOUND')],
  [/^PHASE/, () => err('Kasus tidak sedang dalam tahap perbaikan', 'STATE')],
  [/^TAKEN:(.*)/, (m) => err('Pekerjaan sudah diambil oleh ' + m[1], 'TAKEN')],
  [/^RELEASE_STATE/, () => err('Item tidak sedang diambil', 'STATE')],
  [/^ITEM_STATE/, () => err('Status item sudah berubah, muat ulang', 'STATE')],
  [/^CASE_STATE/, () => err('Kasus tidak sedang menunggu approval (mungkin sudah diputuskan)', 'STATE')],
  [/^STALE/, () => err('Data kasus sudah berubah. Muat ulang sebelum memutuskan.', 'STALE')],
  [/^FORBIDDEN_LEVEL:(.*)/, (m) => err('Kasus ini menunggu approval ' + m[1], 'FORBIDDEN')],
  [/^NOTE_REQUIRED/, () => err('Catatan penolakan wajib diisi')],
  [/^NO_REOPEN/, () => err('Pilih minimal satu item yang perlu dikerjakan ulang')],
];
export async function rpc(fn: string, p: object): Promise<Row> {
  const { data, error } = await db.rpc(fn, { p });
  if (!error) return data;
  for (const [re, mk] of SQL_ERRORS) {
    const m = re.exec(error.message);
    if (m) throw mk(m);
  }
  throw new Error(fn + ': ' + error.message);
}

export function caseVars(c: Row, extra: Record<string, string> = {}): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL');
  return { kasus: c.case_id, alat: c.asset_name_snapshot, status: c.status, link: appUrl ? appUrl + '?case=' + c.case_id : '-', waktu: ts().slice(0, 16), ...extra };
}
export const safeNotify = (type: string, id: string, vars: Record<string, string>) => notify(type, id, vars).catch((e) => console.error('notify ' + type + ': ' + e));

export async function findItem(id: string): Promise<{ it: Row; c: Row }> {
  const [it] = await selectAll('repair_item', (q) => q.eq('case_item_id', String(id)));
  if (!it) throw err('Item perbaikan tidak ditemukan', 'NOT_FOUND');
  const [c] = await selectAll('repair_case', (q) => q.eq('case_id', it.case_id));
  return { it, c };
}

/** canRepair_ dengan daftar alat PIC dihitung sekali (`allowed` dari checkableAssetIds). */
const canRepairWith = (s: Session, it: Row, assetId: string, allowed: Set<string>) =>
  it.department === 'MAINTENANCE' || it.department === 'UTILITY' ? s.role === it.department : it.department === 'PIC' && allowed.has(assetId);
export async function canRepair(s: Session, it: Row, c: Row): Promise<boolean> {
  return canRepairWith(s, it, c.asset_id, new Set(it.department === 'PIC' ? await checkableAssetIds(s) : []));
}

const assertRepairPhase = (c: Row) => {
  if (c.status !== 'PERLU_PERBAIKAN' && c.status !== 'SEDANG_DIPERBAIKI') throw err('Kasus tidak sedang dalam tahap perbaikan', 'STATE');
};

const repairQueue: RouteFn = async (s) => {
  const cases = byKey((await selectAll('repair_case', (q) => q.in('status', ['PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI']))), 'case_id');
  const details = byKey(await selectAll('checklist_detail', (q) => q.neq('case_id', '')), 'detail_id');
  const isGuest = s!.type === 'GUEST', now = ts();
  const allowed = new Set(isGuest ? await checkableAssetIds(s!) : []);
  const rows = (await selectAll('repair_item')).filter((i) => cases[i.case_id] && (!isGuest || canRepairWith(s!, i, cases[i.case_id].asset_id, allowed))).map((i) => {
    const c = cases[i.case_id], d = details[i.last_detail_id] || {};
    return { case_item_id: i.case_item_id, case_id: c.case_id, asset_name: c.asset_name_snapshot, point_name: i.point_name_snapshot,
      department: i.department, status: i.status, claimed_by: i.claimed_by_name_snapshot, mine: isGuest && i.claimed_by_person_id === s!.person_id,
      started_at: i.started_at, completed_at: i.completed_at, occurrence: num(i.occurrence_count), rework: num(i.rework_count), reject_note: i.last_reject_note,
      before_photo: d.photo_file_id || '', finding_note: d.finding_note || '', found_at: d.recorded_at || i.created_at,
      first_finding_at: c.first_finding_at, age_h: hoursBetween(c.first_finding_at, now) };
  }).sort((a, b) => a.first_finding_at.localeCompare(b.first_finding_at) || a.case_item_id.localeCompare(b.case_item_id));
  return { rows };
};

const claimItem: RouteFn = async (s, a) => {
  const { it, c } = await findItem(a.case_item_id);
  assertRepairPhase(c);
  if (!(await canRepair(s!, it, c))) throw err('Item ini bukan antrean departemen Anda', 'FORBIDDEN');
  if (it.status !== 'OPEN') throw err('Pekerjaan sudah diambil oleh ' + (it.claimed_by_name_snapshot || 'teknisi lain'), 'TAKEN');
  const r = await rpc('claim_item', { case_item_id: it.case_item_id, person_id: s!.person_id, name: s!.name, now_str: ts() });
  return { case_status: r.case_status };
};

const completeItem: RouteFn = async (s, a) => {
  const action = String(a.action || '').trim();
  if (!action) throw err('Tindakan perbaikan wajib diisi');
  if (!a.photo) throw err('Foto sesudah perbaikan wajib diunggah', 'PHOTO_REQUIRED');
  const { it, c } = await findItem(a.case_item_id);
  if (it.status !== 'CLAIMED' || it.claimed_by_person_id !== s!.person_id) throw err('Item harus diambil oleh Anda sebelum diselesaikan', 'FORBIDDEN');
  const asset = (await selectAll('master_asset', (q) => q.eq('asset_id', c.asset_id)))[0];
  const photo = await savePhoto(a.photo, asset, 'REPAIR_AFTER_' + it.checkpoint_id + '_' + it.case_item_id + '_' + Date.now());
  let r: Row;
  try {
    r = await rpc('complete_item', { case_item_id: it.case_item_id, person_id: s!.person_id, name: s!.name, action: action.slice(0, 1000), photo_id: photo.id, now_str: ts() });
  } catch (e) {
    try { await trashPhotos([photo.id]); } catch (e2) { console.error('trashPhotos: ' + e2); }
    throw e;
  }
  if (r.ev === 'TO_SPV') await safeNotify('SPV', 'SPV-' + c.case_id + '-' + r.cycle_no, caseVars({ ...c, status: r.case_status }));
  return { case_status: r.case_status };
};

const releaseItem: RouteFn = async (s, a) => {
  const r = await rpc('release_item', { case_item_id: String(a.case_item_id), name: s!.name, reason: a.reason ? String(a.reason) : '', now_str: ts() });
  try { await audit(s, 'RELEASE_ITEM', 'REPAIR_ITEM', r.before.case_item_id, r.before, r.after, a.reason); } catch (e) { console.error('audit RELEASE_ITEM: ' + e); }
  return true;
};

const caseDetail: RouteFn = async (s, a) => {
  const [c] = await selectAll('repair_case', (q) => q.eq('case_id', String(a.case_id)));
  if (!c) throw err('Kasus tidak ditemukan', 'NOT_FOUND');
  if (s!.type === 'GUEST' && c.status === 'SELESAI') throw err('Histori kasus hanya untuk Admin/SPV/Head', 'FORBIDDEN');
  const details = await selectAll('checklist_detail', (q) => q.eq('case_id', c.case_id));
  const heads = byKey(await selectAll('checklist_header', (q) => q.in('checklist_id', [...new Set(details.map((d) => d.checklist_id))])), 'checklist_id');
  const allowed = new Set(s!.type === 'GUEST' ? await checkableAssetIds(s!) : []);
  const items = (await selectAll('repair_item', (q) => q.eq('case_id', c.case_id))).map((i) => ({
    ...clean(i),
    occurrences: details.filter((d) => d.case_item_id === i.case_item_id).map((d) => {
      const h = heads[d.checklist_id] || {};
      return { detail_id: d.detail_id, checklist_id: d.checklist_id, recorded_at: d.recorded_at, checker: h.checker_name_snapshot || '', photo: d.photo_file_id, note: d.finding_note, shift: h.shift_code || '' };
    }),
    can_claim: s!.type === 'GUEST' && i.status === 'OPEN' && canRepairWith(s!, i, c.asset_id, allowed),
    can_complete: s!.type === 'GUEST' && i.status === 'CLAIMED' && i.claimed_by_person_id === s!.person_id,
  }));
  const logs = (await selectAll('repair_log', (q) => q.eq('case_id', c.case_id))).map(clean);
  const approvals = (await selectAll('approval', (q) => q.eq('case_id', c.case_id))).map((p) => ({ ...clean(p), valid: p.cycle_no === c.cycle_no }));
  const level = c.status === 'MENUNGGU_SPV' ? 'SPV' : (c.status === 'MENUNGGU_HEAD' ? 'HEAD' : '');
  return { case: clean(c), items, logs, approvals, can_decide: !!level && (s!.role === 'ADMIN' || s!.role === level), level, can_release: s!.role === 'ADMIN' || s!.role === 'SPV' };
};

const caseList: RouteFn = async (_s, a) => {
  const itemsBy: Record<string, Row[]> = {};
  (await selectAll('repair_item')).forEach((i) => (itemsBy[i.case_id] ||= []).push(i));
  const q = String(a.q || '').toLowerCase(), now = ts();
  const rows = (await selectAll('repair_case')).filter((c) => {
    const its = itemsBy[c.case_id] || [];
    if (a.status && c.status !== a.status) return false;
    if (a.asset_id && c.asset_id !== a.asset_id) return false;
    if (a.dept && !its.some((i) => i.department === a.dept)) return false;
    if (a.from && c.first_finding_at.slice(0, 10) < a.from) return false;
    if (a.to && c.first_finding_at.slice(0, 10) > a.to) return false;
    if (q && !(c.case_id + ' ' + c.asset_name_snapshot).toLowerCase().includes(q)) return false;
    return true;
  }).map((c): Row => {
    const its = itemsBy[c.case_id] || [];
    return { ...clean(c), items: its.length, done: its.filter((i) => i.status === 'DONE').length,
      depts: [...new Set(its.map((i) => i.department))].join(', '), age_h: hoursBetween(c.first_finding_at, c.closed_at || now) };
  }).sort((x, y) => {
    const ox = x.status === 'SELESAI' ? 1 : 0, oy = y.status === 'SELESAI' ? 1 : 0;
    return (ox - oy) || (ox ? y.closed_at.localeCompare(x.closed_at) : x.first_finding_at.localeCompare(y.first_finding_at));
  });
  const size = 25, page = Math.max(1, num(a.page) || 1);
  return { total: rows.length, page, size, rows: rows.slice((page - 1) * size, page * size) };
};

export const REPAIR_ROUTES = { repairQueue, claimItem, completeItem, releaseItem, caseDetail, caseList };
