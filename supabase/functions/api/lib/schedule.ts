import { db, insertRows, selectAll, updateWhere } from './db.ts';
import { notify } from './notify.ts';
import { savePhoto, trashPhotos } from './photos.ts';
import { setSetting, settings } from './settings.ts';
import type { RouteFn, Session } from './types.ts';
import { addDays, CASE_OPEN, clean, DEPTS, err, ids, num, opDate, pad, pts, shiftOf, SHIFTS, ts, uid } from './util.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const byKey = (rows: Row[], k: string) => Object.fromEntries(rows.map((r) => [r[k], r]));
const assetMap = async () => byKey(await selectAll('master_asset'), 'asset_id');

async function activeCps(assetId: string): Promise<Row[]> {
  return (await selectAll('master_checkpoint', (q) => q.eq('asset_id', assetId).eq('active', 'TRUE'))).sort((a, b) => num(a.display_order) - num(b.display_order));
}
export const effStatus = (s: Row, now: Date): string => s.status === 'OPEN' && now >= pts(s.close_at)! ? 'MISSED' : s.status;

export async function isMasterReady() {
  const aset = new Set((await selectAll('master_asset')).filter((a) => a.active === 'TRUE').map((a) => a.asset_id));
  const cps = (await selectAll('master_checkpoint')).filter((c) => c.active === 'TRUE' && aset.has(c.asset_id));
  const unmapped = cps.filter((c) => !DEPTS.includes(c.repair_department)).length;
  return { ok: cps.length > 0 && unmapped === 0, unmapped, total: cps.length };
}

export function slots(asset: Row, day: string): { code: string; open: string; close: string }[] {
  const base = pts(day + ' 07:00:00')!.getTime();
  const mk = (code: string, h0: number, h1: number) => ({ code, open: ts(new Date(base + h0 * 36e5)), close: ts(new Date(base + h1 * 36e5)) });
  return asset.schedule_type === 'SHIFT' ? Object.entries(SHIFTS).map(([k, v]) => mk(k, v[0], v[1])) : [mk('', 0, 24)];
}

/** Idempotent: insert ... on conflict do nothing (schedule_id deterministik), jadi aman dijalankan paralel. */
export async function ensureSchedules(force = false): Promise<void> {
  const st = await settings();
  const now = new Date(), today = opDate(now);
  if (!force && st.LAST_GEN_DATE === today && st.GEN_DIRTY !== 'TRUE') return;
  if (!(await isMasterReady()).ok) return;
  let activated = st.ACTIVATED_AT;
  if (!activated) { activated = ts(now); await setSetting('ACTIVATED_AT', activated, 'SYSTEM'); }
  let days = [today];
  if (st.LAST_GEN_DATE && st.LAST_GEN_DATE < today) {
    days = [];
    for (let d = addDays(st.LAST_GEN_DATE, 1); d <= today && days.length < 7; d = addDays(d, 1)) days.push(d);
    if (days[days.length - 1] !== today) days.push(today);
  }
  const withCps = new Set((await selectAll('master_checkpoint')).filter((c) => c.active === 'TRUE').map((c) => c.asset_id));
  const assets = (await selectAll('master_asset')).filter((a) => a.active === 'TRUE' && withCps.has(a.asset_id));
  const add: Row[] = [];
  for (const day of days) {
    for (const a of assets) {
      const from = a.activated_at > activated ? a.activated_at : activated;
      for (const sl of slots(a, day)) {
        if (sl.close <= from) continue;
        add.push({ schedule_id: 'SCH-' + day.replace(/-/g, '') + '-' + a.asset_id + '-' + (sl.code || 'D'), asset_id: a.asset_id, operational_date: day,
          shift_code: sl.code, open_at: sl.open, close_at: sl.close, status: 'OPEN', checklist_id: '', closed_at: '', processed_at: '' });
      }
    }
  }
  for (let i = 0; i < add.length; i += 500) {
    const { error } = await db.from('schedule').upsert(add.slice(i, i + 500), { onConflict: 'schedule_id', ignoreDuplicates: true });
    if (error) throw new Error('ensureSchedules: ' + error.message);
  }
  await setSetting('LAST_GEN_DATE', today, 'SYSTEM');
  if (st.GEN_DIRTY) await setSetting('GEN_DIRTY', '', 'SYSTEM');
}

/** Tandai TIDAK DIKERJAKAN. closed_at = batas logis, processed_at = waktu proses. Update bersyarat status OPEN. */
export async function markMissed(): Promise<void> {
  const nowStr = ts();
  for (const r of await selectAll('schedule', (q) => q.eq('status', 'OPEN').lte('close_at', nowStr))) {
    await updateWhere('schedule', { status: 'MISSED', closed_at: r.close_at, processed_at: nowStr }, { schedule_id: r.schedule_id, status: 'OPEN' });
  }
}

/** Asset yang boleh diperiksa sesi tamu. RODA DOFFING: gabungan PIC dalam satu pic_group. */
export async function checkableAssetIds(s: Session): Promise<string[]> {
  const assets = (await selectAll('master_asset')).filter((a) => a.active === 'TRUE');
  if (s.role === 'UTILITY') return assets.filter((a) => a.checker_role === 'UTILITY').map((a) => a.asset_id);
  if (s.role !== 'PIC') return [];
  const groups: Record<string, string[]> = {};
  assets.forEach((a) => { if (a.pic_group) groups[a.pic_group] = (groups[a.pic_group] || []).concat(ids(a.pic_ids)); });
  return assets.filter((a) => a.checker_role !== 'UTILITY' && (a.pic_group ? groups[a.pic_group] : ids(a.pic_ids)).includes(s.person_id!)).map((a) => a.asset_id);
}
export function picsOfAsset(asset: Row, assets: Row[]): string[] {
  if (!asset.pic_group) return ids(asset.pic_ids);
  const all = assets.filter((a) => a.pic_group === asset.pic_group && a.active === 'TRUE').flatMap((a) => ids(a.pic_ids));
  return all.filter((x, i) => all.indexOf(x) === i);
}

// ---- Tahap 2: kasus temuan ----
export async function logRepair(c: Row, it: Row, event: string, note: string, nowStr: string, actor?: string): Promise<void> {
  await insertRows('repair_log', [{ log_id: uid('RL'), case_id: c.case_id, case_item_id: it.case_item_id, event, cycle_no: c.cycle_no,
    actor_name: actor || it.claimed_by_name_snapshot, repair_action: it.repair_action, started_at: it.started_at, completed_at: it.completed_at,
    after_photo_file_id: it.after_photo_file_id, note: note || '', created_at: nowStr }]);
}
export function resetItem(it: Row): void {
  Object.assign(it, { status: 'OPEN', claimed_by_person_id: '', claimed_by_name_snapshot: '', repair_action: '', started_at: '', completed_at: '', after_photo_file_id: '' });
}
/** Status kasus dihitung dari item (mengubah `c` di tempat; penyimpanan oleh pemanggil). Return 'TO_SPV' bila semua item DONE. */
export async function recomputeCase(c: Row): Promise<string | null> {
  if (c.status === 'SELESAI') return null;
  const its = await selectAll('repair_item', (q) => q.eq('case_id', c.case_id));
  const waiting = c.status === 'MENUNGGU_SPV' || c.status === 'MENUNGGU_HEAD';
  if (its.length && its.every((i) => i.status === 'DONE')) {
    if (waiting) return null;
    c.status = 'MENUNGGU_SPV';
    return 'TO_SPV';
  }
  if (waiting) c.cycle_no = String(num(c.cycle_no) + 1);
  c.status = its.some((i) => i.status !== 'OPEN') ? 'SEDANG_DIPERBAIKI' : 'PERLU_PERBAIKAN';
  return null;
}

/** Satu kasus terbuka per alat (unique index); insert kalah balapan (23505) -> muat ulang & gabungkan, maks 3 kali. */
export async function mergeFindings(asset: Row, noks: Row[], nowStr: string): Promise<Row> {
  const cps = byKey(await selectAll('master_checkpoint', (q) => q.eq('asset_id', asset.asset_id)), 'checkpoint_id');
  let c: Row | undefined;
  for (let i = 0; i < 3 && !c; i++) {
    [c] = await selectAll('repair_case', (q) => q.eq('asset_id', asset.asset_id).in('status', CASE_OPEN));
    if (c) break;
    const max = (await selectAll('repair_case')).reduce((m, x) => Math.max(m, num(/^CASE-(\d+)$/.exec(x.case_id)?.[1])), 0);
    const row = { case_id: 'CASE-' + pad(max + 1, 5), asset_id: asset.asset_id, asset_name_snapshot: asset.asset_name, opened_at: nowStr,
      status: 'PERLU_PERBAIKAN', first_finding_at: nowStr, last_activity_at: nowStr, closed_at: '', rework_count: '0', cycle_no: '1' };
    const { error } = await db.from('repair_case').insert(row);
    if (!error) c = row;
    else if (error.code !== '23505') throw new Error('insert repair_case: ' + error.message);
  }
  if (!c) throw new Error('mergeFindings: gagal membuat/memuat kasus terbuka setelah 3 percobaan');
  const items = await selectAll('repair_item', (q) => q.eq('case_id', c!.case_id));
  const fresh: Row[] = [], touched: Row[] = [];
  for (const d of noks) {
    let it = items.find((x) => x.checkpoint_id === d.checkpoint_id) || fresh.find((x) => x.checkpoint_id === d.checkpoint_id);
    if (it) {
      it.occurrence_count = String(num(it.occurrence_count) + 1);
      it.last_detail_id = d.detail_id;
      if (it.status === 'DONE') { // NO OK berulang setelah selesai diperbaiki & sebelum Head approve -> buka lagi
        await logRepair(c, it, 'REOPEN_NOK', 'NO OK berulang pada checklist ' + d.checklist_id, nowStr, 'SYSTEM');
        resetItem(it);
      }
      if (!fresh.includes(it) && !touched.includes(it)) touched.push(it);
    } else {
      it = { case_item_id: uid('CI'), case_id: c.case_id, checkpoint_id: d.checkpoint_id, point_name_snapshot: d.point_name_snapshot,
        department: cps[d.checkpoint_id].repair_department, status: 'OPEN', claimed_by_person_id: '', claimed_by_name_snapshot: '', repair_action: '',
        started_at: '', completed_at: '', after_photo_file_id: '', occurrence_count: '1', first_detail_id: d.detail_id, last_detail_id: d.detail_id,
        rework_count: '0', last_reject_note: '', created_at: nowStr };
      fresh.push(it);
    }
    d.case_id = c.case_id; d.case_item_id = it.case_item_id;
  }
  await insertRows('repair_item', fresh);
  for (const it of touched) {
    const { error } = await db.from('repair_item').upsert(it, { onConflict: 'case_item_id' });
    if (error) throw new Error('upsert repair_item: ' + error.message);
  }
  c.last_activity_at = nowStr;
  await recomputeCase(c);
  const { error } = await db.from('repair_case').update({ last_activity_at: c.last_activity_at, status: c.status, cycle_no: c.cycle_no }).eq('case_id', c.case_id);
  if (error) throw new Error('update repair_case: ' + error.message);
  return c;
}

// ---- Tahap 1: checklist ----
const worklist: RouteFn = async (s) => {
  await ensureSchedules();
  const ready = await isMasterReady();
  const now = new Date(), nowStr = ts(now);
  if (!ready.ok) return { ready: false, unmapped: ready.unmapped, total: ready.total };
  const allowed = new Set(await checkableAssetIds(s!));
  const am = await assetMap();
  const cnt: Record<string, number> = {};
  (await selectAll('master_checkpoint', (q) => q.eq('active', 'TRUE'))).forEach((c) => { cnt[c.asset_id] = (cnt[c.asset_id] || 0) + 1; });
  const items = (await selectAll('schedule', (q) => q.in('status', ['OPEN', 'DONE']).lte('open_at', nowStr).gt('close_at', nowStr)))
    .filter((r) => allowed.has(r.asset_id))
    .map((r) => ({ schedule_id: r.schedule_id, asset_id: r.asset_id, asset_name: am[r.asset_id].asset_name, shift_code: r.shift_code,
      close_at: r.close_at, done: r.status === 'DONE', points: cnt[r.asset_id] || 0 }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.asset_name.localeCompare(b.asset_name));
  return { ready: true, opDate: opDate(now), shift: shiftOf(now), items };
};

async function loadSchedForChecker(s: Session, scheduleId: string, now: Date): Promise<Row> {
  const [sch] = await selectAll('schedule', (q) => q.eq('schedule_id', String(scheduleId)));
  if (!sch) throw err('Jadwal tidak ditemukan', 'NOT_FOUND');
  if (!(await checkableAssetIds(s)).includes(sch.asset_id)) throw err('Anda tidak terdaftar sebagai pemeriksa alat ini', 'FORBIDDEN');
  if (sch.status === 'DONE') throw err('Jadwal ini sudah diperiksa', 'DUPLICATE');
  if (effStatus(sch, now) !== 'OPEN' || now < pts(sch.open_at)!) throw err('Jadwal sudah ditutup (TIDAK DIKERJAKAN) atau belum dibuka', 'CLOSED');
  if (!(await isMasterReady()).ok) throw err('Master checklist belum siap (mapping departemen belum lengkap)', 'NOT_READY');
  return sch;
}

const checklistForm: RouteFn = async (s, a) => {
  const sch = await loadSchedForChecker(s!, a.schedule_id, new Date());
  const asset = (await assetMap())[sch.asset_id];
  const [openCase] = await selectAll('repair_case', (q) => q.eq('asset_id', asset.asset_id).in('status', CASE_OPEN));
  const openCps = new Set<string>();
  if (openCase) (await selectAll('repair_item', (q) => q.eq('case_id', openCase.case_id).neq('status', 'DONE'))).forEach((i) => openCps.add(i.checkpoint_id));
  return { schedule_id: sch.schedule_id, asset_id: asset.asset_id, asset_name: asset.asset_name, shift_code: sch.shift_code,
    operational_date: sch.operational_date, close_at: sch.close_at, case_id: openCase ? openCase.case_id : '',
    points: (await activeCps(asset.asset_id)).map((c) => ({ checkpoint_id: c.checkpoint_id, point_name: c.point_name, target_label: c.target_label, in_repair: openCps.has(c.checkpoint_id) })) };
};

async function validateResults(sch: Row, results: Row[]) {
  const cps = await activeCps(sch.asset_id);
  const byId = byKey(results || [], 'checkpoint_id');
  if (Object.keys(byId).length !== cps.length || cps.some((c) => !byId[c.checkpoint_id]))
    throw err('Semua checkpoint wajib dinilai. Daftar checkpoint mungkin berubah, muat ulang form.', 'INCOMPLETE');
  for (const c of cps) {
    const r = byId[c.checkpoint_id];
    if (r.result !== 'OK' && r.result !== 'NO OK') throw err('Hasil hanya OK atau NO OK');
    if (r.result === 'NO OK' && !r.photo) throw err('Foto wajib untuk point NO OK: ' + c.point_name, 'PHOTO_REQUIRED');
  }
  return { cps, byId };
}

const submitChecklist: RouteFn = async (s, a) => {
  const now = new Date(), nowStr = ts(now);
  const sch = await loadSchedForChecker(s!, a.schedule_id, now);
  const v = await validateResults(sch, a.results);
  const asset = (await assetMap())[sch.asset_id];
  const checklistId = 'CL-' + nowStr.replace(/\D/g, '') + '-' + crypto.randomUUID().slice(0, 4).toUpperCase();
  const photos: Record<string, { id: string; url: string }> = {};
  let claimed = false;
  try {
    for (const c of v.cps) {
      const r = v.byId[c.checkpoint_id];
      if (r.result === 'NO OK') photos[c.checkpoint_id] = await savePhoto(r.photo, asset, 'CHECKLIST_NO_OK_' + c.checkpoint_id + '_' + checklistId);
    }
    // klaim jadwal: hanya satu pemanggil yang menang
    if (!await updateWhere('schedule', { status: 'DONE', checklist_id: checklistId, closed_at: nowStr, processed_at: nowStr }, { schedule_id: sch.schedule_id, status: 'OPEN' }))
      throw err('Jadwal sudah diperiksa', 'DUPLICATE');
    claimed = true;
    const details = v.cps.map((c) => {
      const r = v.byId[c.checkpoint_id], p = photos[c.checkpoint_id];
      return { detail_id: uid('CD'), checklist_id: checklistId, checkpoint_id: c.checkpoint_id, point_name_snapshot: c.point_name, result: r.result,
        photo_file_id: p ? p.id : '', photo_url: p ? p.url : '', finding_note: String(r.note || '').trim().slice(0, 500), case_id: '', case_item_id: '', recorded_at: nowStr };
    });
    const noks = details.filter((d) => d.result === 'NO OK');
    const cs = noks.length ? await mergeFindings(asset, noks, nowStr) : null;
    await insertRows('checklist_detail', details);
    await insertRows('checklist_header', [{ checklist_id: checklistId, schedule_id: sch.schedule_id, asset_id: asset.asset_id, asset_name_snapshot: asset.asset_name,
      operational_date: sch.operational_date, shift_code: sch.shift_code, checker_person_id: s!.person_id, checker_name_snapshot: s!.name, checker_role: s!.role,
      submitted_at: nowStr, ok_count: String(details.length - noks.length), nok_count: String(noks.length), overall_result: noks.length ? 'NO OK' : 'OK' }]);

    if (cs) { // notifikasi setelah data tersimpan; kegagalan tidak membatalkan checklist
      const cpm = byKey(v.cps, 'checkpoint_id');
      const appUrl = Deno.env.get('APP_URL');
      const base = { alat: asset.asset_name, pic: s!.name, waktu: nowStr.slice(0, 16), kasus: cs.case_id, link: appUrl ? appUrl + '?case=' + cs.case_id : '-' };
      try {
        if ((await settings()).NOK_FORMAT === 'ASSET') {
          await notify('NOK', 'NOKA-' + checklistId, { ...base, daftar: noks.map((d) => '- ' + d.point_name_snapshot + ' [' + cpm[d.checkpoint_id].repair_department + ']' + (d.finding_note ? ': ' + d.finding_note : '')).join('\n') }, 'TPL_NOK_ASSET');
        } else {
          for (const d of noks) await notify('NOK', 'NOK-' + d.detail_id, { ...base, checkpoint: d.point_name_snapshot, departemen: cpm[d.checkpoint_id].repair_department, catatan: d.finding_note || '-' });
        }
      } catch (e) { console.error('notify NOK: ' + e); }
    }
    return { checklist_id: checklistId, nok: noks.length, case_id: cs ? cs.case_id : '' };
  } catch (e) {
    if (claimed) await updateWhere('schedule', { status: 'OPEN', checklist_id: '', closed_at: '', processed_at: '' }, { schedule_id: sch.schedule_id, checklist_id: checklistId }).catch(() => 0);
    await trashPhotos(Object.values(photos).map((p) => p.id));
    throw e;
  }
};

const todaySchedules: RouteFn = async (_s, a) => {
  await ensureSchedules();
  const now = new Date();
  const day = a.date || opDate(now);
  const assets = await selectAll('master_asset');
  const am = byKey(assets, 'asset_id'), pm = byKey(await selectAll('master_person'), 'person_id');
  const heads = byKey(await selectAll('checklist_header', (q) => q.eq('operational_date', day)), 'checklist_id');
  const rows = (await selectAll('schedule', (q) => q.eq('operational_date', day))).filter((r) => r.status !== 'BATAL').map((r) => {
    const h = heads[r.checklist_id] || {}, asset = am[r.asset_id];
    return { schedule_id: r.schedule_id, asset_id: r.asset_id, asset_name: asset.asset_name, shift_code: r.shift_code, close_at: r.close_at,
      status: effStatus(r, now), checklist_id: r.checklist_id, checker: h.checker_name_snapshot || '', submitted_at: h.submitted_at || '',
      nok: num(h.nok_count), pics: asset.checker_role === 'UTILITY' ? 'UTILITY' : picsOfAsset(asset, assets).map((id) => pm[id] ? pm[id].display_name : id).join(', ') };
  }).sort((x, y) => x.asset_id.localeCompare(y.asset_id) || x.shift_code.localeCompare(y.shift_code));
  return { date: day, ready: await isMasterReady(), rows };
};

const checklistDetail: RouteFn = async (_s, a) => {
  const [h] = await selectAll('checklist_header', (q) => q.eq('checklist_id', String(a.checklist_id)));
  if (!h) throw err('Checklist tidak ditemukan', 'NOT_FOUND');
  return { header: clean(h), details: (await selectAll('checklist_detail', (q) => q.eq('checklist_id', h.checklist_id))).map(clean) };
};

export const SCHEDULE_ROUTES = { worklist, checklistForm, submitChecklist, todaySchedules, checklistDetail };
