// deno-lint-ignore-file no-explicit-any
import { selectAll } from './db.ts';
import { photoSignedUrl } from './photos.ts';
import { effStatus, ensureSchedules, isMasterReady, picsOfAsset } from './schedule.ts';
import { audit } from './settings.ts';
import type { RouteFn } from './types.ts';
import { addDays, CASE_OPEN, DEPTS, err, hoursBetween, num, opDate, pad, pts, shiftOf, ts } from './util.ts';

type Row = Record<string, any>;
const mapBy = (rows: Row[], k: string): Record<string, Row> => Object.fromEntries(rows.map((r) => [r[k], r]));
const pct = (a: number, b: number) => a + b ? Math.round(a / (a + b) * 1000) / 10 : null;

const lookups: RouteFn = async () => {
  const now = new Date();
  const assets = (await selectAll('master_asset')).map((a) => ({ id: a.asset_id, name: a.asset_name, active: a.active === 'TRUE', type: a.schedule_type }));
  const pics = (await selectAll('master_person')).filter((p) => p.role_type === 'PIC').map((p) => ({ id: p.person_id, name: p.display_name }));
  const pending = (await selectAll('repair_case')).filter((c) => c.status === 'MENUNGGU_SPV' || c.status === 'MENUNGGU_HEAD');
  let dataFrom = '', dataTo = ''; // rentang hari operasional yang punya jadwal di database
  for (const r of await selectAll('schedule')) {
    const d = r.operational_date; if (!d) continue;
    if (!dataFrom || d < dataFrom) dataFrom = d;
    if (!dataTo || d > dataTo) dataTo = d;
  }
  return { assets, pics, opDate: opDate(now), shift: shiftOf(now), dataFrom, dataTo,
    pendingSpv: pending.filter((c) => c.status === 'MENUNGGU_SPV').length,
    pendingHead: pending.filter((c) => c.status === 'MENUNGGU_HEAD').length, ready: await isMasterReady() };
};

/** Kumpulan data terfilter yang dipakai dashboard & laporan. */
async function scope(f: Row) {
  const now = new Date(), today = opDate(now);
  const to = f.to || today, from = f.from || to;
  const assets = await selectAll('master_asset'), am = mapBy(assets, 'asset_id');
  const assetOk = (id: string) => {
    if (f.asset_id && id !== f.asset_id) return false;
    if (f.pic_id && !(am[id] && picsOfAsset(am[id], assets).includes(f.pic_id))) return false;
    return true;
  };
  const sch = (await selectAll('schedule')).filter((r) =>
    r.status !== 'BATAL' && r.operational_date >= from && r.operational_date <= to && assetOk(r.asset_id) && (!f.shift || r.shift_code === f.shift))
    .map((r) => ({ ...r, eff: effStatus(r, now) }));
  const heads = (await selectAll('checklist_header')).filter((h) =>
    h.operational_date >= from && h.operational_date <= to && assetOk(h.asset_id) && (!f.shift || h.shift_code === f.shift));
  const hm = mapBy(heads, 'checklist_id');
  const noks = (await selectAll('checklist_detail')).filter((d) => d.result === 'NO OK' && hm[d.checklist_id]);
  const itemsAll = (await selectAll('repair_item')).filter((i) => !f.dept || i.department === f.dept);
  const itemsBy: Record<string, Row[]> = {};
  itemsAll.forEach((i) => (itemsBy[i.case_id] ||= []).push(i));
  const cases = (await selectAll('repair_case')).filter((c) => assetOk(c.asset_id) && (!f.dept || itemsBy[c.case_id]) && (!f.status || c.status === f.status));
  return { now, today, from, to, am, assets, sch, heads, hm, noks, cases, itemsBy, itemsAll };
}
type Scope = Awaited<ReturnType<typeof scope>>;
const inRange = (t: string, sc: { from: string; to: string }) => { if (!t) return false; const d = opDate(pts(t)!); return d >= sc.from && d <= sc.to; };
const avg = (arr: unknown[]) => {
  const v = arr.filter((x) => x !== '' && !isNaN(x as number)) as number[];
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
};
const personMap = async () => mapBy(await selectAll('master_person'), 'person_id');
const uniq = (arr: string[]) => arr.filter((x, i) => x && arr.indexOf(x) === i);

async function dashboardData(f: Row, sc0?: Scope) {
  const sc = sc0 || await scope(f);
  const nowStr = ts(sc.now);
  const cnt = (arr: Row[], st: string) => arr.filter((r) => r.eff === st).length;
  const done = cnt(sc.sch, 'DONE'), missed = cnt(sc.sch, 'MISSED'), open = cnt(sc.sch, 'OPEN');
  const openCases = sc.cases.filter((c) => c.status !== 'SELESAI');
  const openItems: Row[] = openCases.flatMap((c) => sc.itemsBy[c.case_id] || []);

  // Tren: gran D = harian (14 hari bila 1 hari dipilih), W = mingguan Senin–Minggu (12 minggu), M = bulanan (12 bulan)
  const gran = f.gran === 'W' || f.gran === 'M' ? f.gran : 'D';
  const monday = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const bucket = (d: string) => gran === 'W' ? monday(d) : gran === 'M' ? d.slice(0, 7) : d;
  const single = sc.from === sc.to;
  let tFrom = sc.from;
  if (gran === 'D' && single) tFrom = addDays(sc.to, -13);
  if (gran === 'W') tFrom = single ? addDays(monday(sc.to), -77) : monday(sc.from);
  if (gran === 'M') {
    if (single) { const y = +sc.to.slice(0, 4), m = +sc.to.slice(5, 7) - 11; tFrom = (m < 1 ? y - 1 : y) + '-' + pad(m < 1 ? m + 12 : m, 2) + '-01'; }
    else tFrom = sc.from.slice(0, 7) + '-01';
  }
  const trendScope = tFrom === sc.from ? sc : await scope({ ...f, from: tFrom, to: sc.to });
  const keys: string[] = [];
  for (let d = tFrom, n = 0; d <= sc.to && n < (gran === 'D' ? 92 : 400); d = addDays(d, 1), n++) { const k = bucket(d); if (keys[keys.length - 1] !== k) keys.push(k); }
  const schBy: Record<string, Row[]> = {}, nokBy: Record<string, number> = {};
  trendScope.sch.forEach((r) => (schBy[bucket(r.operational_date)] ||= []).push(r));
  trendScope.noks.forEach((x) => { const k = bucket(trendScope.hm[x.checklist_id].operational_date); nokBy[k] = (nokBy[k] || 0) + 1; });
  const trend = keys.map((k) => {
    const rows = schBy[k] || [], dn = cnt(rows, 'DONE'), ms = cnt(rows, 'MISSED');
    return { date: k, done: dn, missed: ms, open: cnt(rows, 'OPEN'), compliance: pct(dn, ms), nok: nokBy[k] || 0 };
  });
  const shiftComp = ['1', '2', '3'].map((k) => {
    const rows = sc.sch.filter((r) => r.shift_code === k), dn = cnt(rows, 'DONE'), ms = cnt(rows, 'MISSED');
    return { shift: k, done: dn, missed: ms, open: cnt(rows, 'OPEN'), compliance: pct(dn, ms) };
  });
  // Temuan per checkpoint (top 10) dan berulang
  const byCp: Record<string, { asset: string; point: string; n: number }> = {};
  sc.noks.forEach((d) => {
    const h = sc.hm[d.checklist_id], k = h.asset_id + '|' + d.checkpoint_id;
    byCp[k] ||= { asset: h.asset_name_snapshot, point: d.point_name_snapshot, n: 0 };
    byCp[k].n++;
  });
  const topCp = Object.values(byCp).sort((a, b) => b.n - a.n);
  // Performa PIC
  const pm = await personMap();
  const pic: Record<string, Row> = {};
  sc.sch.forEach((r) => {
    const a = sc.am[r.asset_id];
    if (a.checker_role === 'UTILITY') return;
    picsOfAsset(a, sc.assets).forEach((pid) => {
      const p = pic[pid] ||= { name: pm[pid] ? pm[pid].display_name : pid, assigned: 0, covered: 0, missed: 0, open: 0, byMe: 0 };
      p.assigned++;
      if (r.eff === 'DONE') p.covered++; else if (r.eff === 'MISSED') p.missed++; else p.open++;
    });
  });
  sc.heads.forEach((h) => { if (pic[h.checker_person_id]) pic[h.checker_person_id].byMe++; });
  const picPerf = Object.values(pic).map((p) => ({ ...p, coverage: pct(p.covered, p.missed) }))
    .filter((p) => !f.pic_id || p.name === (pm[f.pic_id] || {}).display_name)
    .sort((a, b) => Number(a.coverage === null) - Number(b.coverage === null) || a.coverage! - b.coverage!);
  // Performa departemen
  const logs = await selectAll('repair_log');
  const caseById = mapBy(sc.cases, 'case_id');
  const deptPerf = DEPTS.filter((d) => !f.dept || d === f.dept).map((dep) => {
    const its = sc.itemsAll.filter((i) => i.department === dep && caseById[i.case_id]);
    const mine = mapBy(its, 'case_item_id');
    const doneLogs = logs.filter((l) => l.event === 'DONE' && mine[l.case_item_id] && inRange(l.completed_at, sc));
    return { dept: dep, received: its.filter((i) => inRange(i.created_at, sc)).length, done: doneLogs.length,
      rework: logs.filter((l) => l.event === 'REOPEN_REJECT' && mine[l.case_item_id] && inRange(l.created_at, sc)).length,
      open_now: its.filter((i) => i.status !== 'DONE' && CASE_OPEN.includes(caseById[i.case_id].status)).length,
      avg_work_h: avg(doneLogs.map((l) => hoursBetween(l.started_at, l.completed_at))) };
  });
  const closed = sc.cases.filter((c) => c.status === 'SELESAI' && inRange(c.closed_at, sc));
  const nItems = (st: string) => openItems.filter((i) => i.status === st).length;
  const nCases = (st: string) => openCases.filter((c) => c.status === st).length;
  return {
    period: { from: sc.from, to: sc.to, generated_at: nowStr },
    kpi: {
      assets: (await selectAll('master_asset')).filter((a) => a.active === 'TRUE').length,
      scheduled: sc.sch.length, done, missed, open, compliance: pct(done, missed),
      nok_events: sc.noks.length, nok_open_items: openItems.filter((i) => i.status !== 'DONE').length,
      cases_perlu: nCases('PERLU_PERBAIKAN'), cases_sedang: nCases('SEDANG_DIPERBAIKI'),
      items_open: nItems('OPEN'), items_claimed: nItems('CLAIMED'),
      wait_spv: nCases('MENUNGGU_SPV'), wait_head: nCases('MENUNGGU_HEAD'), closed: closed.length,
    },
    trend, gran, shiftComp, topCp: topCp.slice(0, 10), recurring: topCp.filter((x) => x.n >= 2).slice(0, 15),
    repairStatus: { open: nItems('OPEN'), claimed: nItems('CLAIMED'), done_waiting: nItems('DONE'), closed_cases: closed.length },
    resolution: { avg_case_h: avg(closed.map((c) => hoursBetween(c.first_finding_at, c.closed_at))),
      avg_work_h: avg(logs.filter((l) => l.event === 'DONE' && inRange(l.completed_at, sc)).map((l) => hoursBetween(l.started_at, l.completed_at))) },
    picPerf, deptPerf,
    oldest: openCases.slice().sort((a, b) => a.first_finding_at.localeCompare(b.first_finding_at)).slice(0, 10).map((c) => {
      const its = sc.itemsBy[c.case_id] || [];
      return { case_id: c.case_id, asset: c.asset_name_snapshot, status: c.status, age_h: hoursBetween(c.first_finding_at, nowStr),
        points: its.map((i) => i.point_name_snapshot).join(', '), depts: uniq(its.map((i) => i.department)).join(', ') };
    }),
  };
}
const dashboard: RouteFn = async (_s, f) => { await ensureSchedules(); return dashboardData(f); };

const kanban: RouteFn = async (_s, a) => {
  await ensureSchedules();
  const now = new Date(), nowStr = ts(now);
  const day = a.date || opDate(now);
  const assets = await selectAll('master_asset'), am = mapBy(assets, 'asset_id'), pm = await personMap();
  const heads = mapBy(await selectAll('checklist_header'), 'checklist_id');
  const picNames = (asset: Row) => asset.checker_role === 'UTILITY' ? 'UTILITY' : picsOfAsset(asset, assets).map((id) => pm[id] ? pm[id].display_name : id).join(', ');
  const sch = (await selectAll('schedule', (q) => q.eq('operational_date', day))).filter((r) => r.status !== 'BATAL');
  const col1 = sch.filter((r) => effStatus(r, now) === 'OPEN' && pts(r.open_at)! <= now).map((r) => ({
    type: 'schedule', id: r.schedule_id, asset_id: r.asset_id, asset_name: am[r.asset_id].asset_name, date: r.operational_date, shift: r.shift_code, who: picNames(am[r.asset_id]), close_at: r.close_at }));
  const col2 = sch.filter((r) => r.status === 'DONE' && heads[r.checklist_id] && num(heads[r.checklist_id].nok_count) === 0).map((r) => {
    const h = heads[r.checklist_id];
    return { type: 'schedule', id: r.schedule_id, checklist_id: r.checklist_id, asset_id: r.asset_id, asset_name: am[r.asset_id].asset_name, date: r.operational_date, shift: r.shift_code, who: h.checker_name_snapshot, at: h.submitted_at };
  });
  const missed = sch.filter((r) => effStatus(r, now) === 'MISSED').length;
  const itemsBy: Record<string, Row[]> = {};
  (await selectAll('repair_item')).forEach((i) => (itemsBy[i.case_id] ||= []).push(i));
  const weekAgo = ts(new Date(pts(day + ' 07:00:00')!.getTime() - 6 * 864e5));
  const cases = (await selectAll('repair_case')).filter((c) => c.status !== 'SELESAI' || c.closed_at >= weekAgo).map((c) => {
    const its = itemsBy[c.case_id] || [];
    return { type: 'case', id: c.case_id, asset_id: c.asset_id, asset_name: c.asset_name_snapshot, status: c.status, first_finding_at: c.first_finding_at,
      age_h: hoursBetween(c.first_finding_at, c.closed_at || nowStr), points: its.length, depts: uniq(its.map((i) => i.department)).join(', '),
      who: uniq(its.map((i) => i.claimed_by_name_snapshot)).join(', '), rework: num(c.rework_count) };
  }).sort((x, y) => x.first_finding_at.localeCompare(y.first_finding_at));
  const by = (st: string) => cases.filter((c) => c.status === st);
  return { date: day, missed, columns: [
    { key: 'BELUM', title: 'Belum Diperiksa', cards: col1 },
    { key: 'CEK_OK', title: 'Pengecekan Selesai', cards: col2 },
    { key: 'PERLU_PERBAIKAN', title: 'Perlu Perbaikan', cards: by('PERLU_PERBAIKAN') },
    { key: 'SEDANG_DIPERBAIKI', title: 'Sedang Diperbaiki', cards: by('SEDANG_DIPERBAIKI') },
    { key: 'MENUNGGU_SPV', title: 'Menunggu Approval SPV', cards: by('MENUNGGU_SPV') },
    { key: 'MENUNGGU_HEAD', title: 'Menunggu Approval Head', cards: by('MENUNGGU_HEAD') },
    { key: 'SELESAI', title: 'Selesai (7 hari)', cards: by('SELESAI').reverse() },
  ] };
};

const REPORTS: Record<string, string> = {
  checklist: 'Laporan Checklist Harian / per Shift',
  missed: 'Laporan Jadwal TIDAK DIKERJAKAN',
  findings: 'Laporan Temuan NO OK',
  repairs: 'Laporan Kasus & Detail Perbaikan',
  approvals: 'Laporan Approval SPV & Head',
  pic: 'Laporan Performa PIC',
  dept: 'Laporan Performa Departemen',
  age: 'Laporan Umur Kasus & Waktu Penyelesaian',
};

/** Link foto laporan: tautan Drive lama apa adanya, foto baru -> signed URL 7 hari. */
async function photoLink(d: Row): Promise<string> {
  if (String(d.photo_url || '').startsWith('https://drive.google.com')) return d.photo_url;
  if (!d.photo_file_id) return d.photo_url || '';
  try { return await photoSignedUrl(d.photo_file_id, 604800); } catch { return ''; }
}

async function buildReport(f: Row) {
  if (!REPORTS[f.type]) throw err('Jenis laporan tidak dikenal');
  const sc = await scope(f), pm = await personMap();
  const st: Record<string, string> = { OPEN: 'BELUM DIPERIKSA', DONE: 'SELESAI', MISSED: 'TIDAK DIKERJAKAN' };
  let cols: string[] = [], rows: any[][] = [];
  const relevant = (c: Row) => inRange(c.first_finding_at, sc) || CASE_OPEN.includes(c.status) || inRange(c.closed_at, sc);
  if (f.type === 'checklist') {
    cols = ['Tgl Operasional', 'Shift', 'ID Alat', 'Nama Alat', 'Status', 'Pemeriksa', 'Waktu Submit', 'OK', 'NO OK', 'Hasil'];
    const allHeads = mapBy(await selectAll('checklist_header'), 'checklist_id');
    rows = sc.sch.map((r) => {
      const h = allHeads[r.checklist_id] || {};
      return [r.operational_date, r.shift_code || 'Harian', r.asset_id, sc.am[r.asset_id].asset_name, st[r.eff] || r.eff, h.checker_name_snapshot || '', h.submitted_at || '', h.ok_count || '', h.nok_count || '', h.overall_result || ''];
    });
  } else if (f.type === 'missed') {
    cols = ['Tgl Operasional', 'Shift', 'ID Alat', 'Nama Alat', 'PIC Terdaftar', 'Ditutup'];
    rows = sc.sch.filter((r) => r.eff === 'MISSED').map((r) => {
      const a = sc.am[r.asset_id];
      return [r.operational_date, r.shift_code || 'Harian', r.asset_id, a.asset_name, a.checker_role === 'UTILITY' ? 'UTILITY' : picsOfAsset(a, sc.assets).map((id) => pm[id] ? pm[id].display_name : id).join(', '), r.close_at];
    });
  } else if (f.type === 'findings') {
    cols = ['Tgl Operasional', 'Waktu', 'Shift', 'Alat', 'Checkpoint', 'Pemeriksa', 'Catatan', 'Kasus', 'Departemen', 'Link Foto (Drive)'];
    const cps = mapBy(await selectAll('master_checkpoint'), 'checkpoint_id');
    // sel terakhir sementara berisi baris detail; di-resolve ke link hanya untuk baris yang dikembalikan (lihat finishRows)
    rows = sc.noks.filter((d) => !f.dept || (cps[d.checkpoint_id] || {}).repair_department === f.dept).map((d) => {
      const h = sc.hm[d.checklist_id];
      return [h.operational_date, d.recorded_at, h.shift_code || 'Harian', h.asset_name_snapshot, d.point_name_snapshot, h.checker_name_snapshot, d.finding_note, d.case_id,
        (cps[d.checkpoint_id] || {}).repair_department || '', d];
    });
  } else if (f.type === 'repairs') {
    cols = ['Kasus', 'Alat', 'Status Kasus', 'Item', 'Checkpoint', 'Departemen', 'Status Item', 'Teknisi', 'Tindakan', 'Mulai', 'Selesai', 'Durasi (jam)', 'Kejadian', 'Rework', 'Catatan Tolak'];
    sc.cases.filter(relevant).forEach((c) => (sc.itemsBy[c.case_id] || []).forEach((i) => {
      rows.push([c.case_id, c.asset_name_snapshot, c.status, i.case_item_id, i.point_name_snapshot, i.department, i.status, i.claimed_by_name_snapshot, i.repair_action,
        i.started_at, i.completed_at, hoursBetween(i.started_at, i.completed_at), i.occurrence_count, i.rework_count, i.last_reject_note]);
    }));
  } else if (f.type === 'approvals') {
    cols = ['Waktu', 'Kasus', 'Alat', 'Level', 'Keputusan', 'Approver', 'Role', 'Catatan', 'Item Rework', 'Siklus', 'Berlaku'];
    const cm = mapBy(sc.cases, 'case_id');
    rows = (await selectAll('approval')).filter((p) => cm[p.case_id] && inRange(p.decided_at, sc)).map((p) => {
      const c = cm[p.case_id];
      return [p.decided_at, p.case_id, c.asset_name_snapshot, p.level, p.decision === 'APPROVE' ? 'SETUJU' : 'TOLAK', p.approver_name, p.approver_role, p.note, p.reopened_items, p.cycle_no, p.cycle_no === c.cycle_no ? 'Ya' : 'Tidak (siklus lama)'];
    });
  } else if (f.type === 'pic') {
    const d = await dashboardData(f, sc);
    cols = ['PIC', 'Jadwal Tanggung Jawab', 'Terperiksa', 'Tidak Dikerjakan', 'Belum (berjalan)', 'Diperiksa Sendiri', 'Cakupan %'];
    rows = d.picPerf.map((p) => [p.name, p.assigned, p.covered, p.missed, p.open, p.byMe, p.coverage === null ? '' : p.coverage]);
  } else if (f.type === 'dept') {
    const d = await dashboardData(f, sc);
    cols = ['Departemen', 'Item Diterima', 'Item Selesai', 'Rework', 'Terbuka Saat Ini', 'Rata-rata Waktu Kerja (jam)'];
    rows = d.deptPerf.map((p) => [p.dept, p.received, p.done, p.rework, p.open_now, p.avg_work_h === null ? '' : p.avg_work_h]);
  } else if (f.type === 'age') {
    cols = ['Kasus', 'Alat', 'Status', 'Temuan Pertama', 'Ditutup', 'Umur / Lama Selesai (jam)', 'Jumlah Item', 'Total Waktu Kerja (jam)', 'Rework'];
    const now = ts(sc.now), logs = (await selectAll('repair_log')).filter((l) => l.event === 'DONE');
    rows = sc.cases.filter(relevant).map((c) => {
      const work = logs.filter((l) => l.case_id === c.case_id).reduce((t, l) => t + (num(hoursBetween(l.started_at, l.completed_at)) || 0), 0);
      return [c.case_id, c.asset_name_snapshot, c.status, c.first_finding_at, c.closed_at, hoursBetween(c.first_finding_at, c.closed_at || now), (sc.itemsBy[c.case_id] || []).length, Math.round(work * 10) / 10, c.rework_count];
    }).sort((a, b) => (b[5] as number) - (a[5] as number));
  }
  return { title: REPORTS[f.type], columns: cols, rows, period: sc.from + ' s.d. ' + sc.to };
}
const finishRows = async (type: string, rows: any[][]) =>
  type === 'findings' ? await Promise.all(rows.map(async (r) => [...r.slice(0, -1), await photoLink(r[r.length - 1])])) : rows;

async function filterText(f: Row): Promise<string> {
  const am = mapBy(await selectAll('master_asset'), 'asset_id'), pm = await personMap();
  const parts: string[] = [];
  if (f.asset_id) parts.push('Alat: ' + (am[f.asset_id] ? am[f.asset_id].asset_name : f.asset_id));
  if (f.pic_id) parts.push('PIC: ' + (pm[f.pic_id] ? pm[f.pic_id].display_name : f.pic_id));
  if (f.dept) parts.push('Departemen: ' + f.dept);
  if (f.shift) parts.push('Shift: ' + f.shift);
  if (f.status) parts.push('Status: ' + f.status);
  return parts.join(' · ') || 'Tanpa filter';
}

const report: RouteFn = async (s, f) => {
  const r = await buildReport(f);
  if (f.all) {
    const out = { title: r.title, period: r.period, columns: r.columns, total: r.rows.length, page: 1, size: r.rows.length,
      rows: await finishRows(f.type, r.rows), types: REPORTS, filter_text: await filterText(f), generated_at: ts() };
    if (f.format === 'xlsx' || f.format === 'pdf') {
      try { await audit(s, 'EXPORT_' + f.format.toUpperCase(), 'REPORT', f.type, null, f, ''); } catch (e) { console.error('audit EXPORT: ' + e); }
    }
    return out;
  }
  const size = 50, page = Math.max(1, num(f.page) || 1);
  return { title: r.title, period: r.period, columns: r.columns, total: r.rows.length, page, size,
    rows: await finishRows(f.type, r.rows.slice((page - 1) * size, page * size)), types: REPORTS };
};

const exportReport: RouteFn = () => Promise.reject(err('Export dibuat di browser', 'NOT_FOUND'));

export const MONITORING_ROUTES = { lookups, dashboard, kanban, report, exportReport };
