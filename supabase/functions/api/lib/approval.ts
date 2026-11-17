// deno-lint-ignore-file no-explicit-any
import { selectAll } from './db.ts';
import { caseVars, rpc, safeNotify } from './repair.ts';
import { audit } from './settings.ts';
import type { RouteFn } from './types.ts';
import { clean, err, hoursBetween, num, ts, uid } from './util.ts';

const approvalQueue: RouteFn = async (s) => {
  const want = s!.role === 'ADMIN' ? ['MENUNGGU_SPV', 'MENUNGGU_HEAD'] : [s!.role === 'SPV' ? 'MENUNGGU_SPV' : 'MENUNGGU_HEAD'];
  const itemsBy: Record<string, Record<string, string>[]> = {};
  (await selectAll('repair_item')).forEach((i) => (itemsBy[i.case_id] ||= []).push(i));
  const now = ts();
  const rows = (await selectAll('repair_case', (q) => q.in('status', want))).map((c): Record<string, any> => {
    const its = itemsBy[c.case_id] || [];
    return { ...clean(c), items: its.length, rework: num(c.rework_count), age_h: hoursBetween(c.first_finding_at, now),
      technicians: [...new Set(its.map((i) => i.claimed_by_name_snapshot).filter(Boolean))].join(', ') };
  }).sort((x, y) => x.first_finding_at.localeCompare(y.first_finding_at));
  return { rows };
};

const decide: RouteFn = async (s, a) => {
  const decision = a.decision === 'APPROVE' ? 'APPROVE' : (a.decision === 'REJECT' ? 'REJECT' : '');
  if (!decision) throw err('Keputusan tidak valid');
  const note = String(a.note || '').trim().slice(0, 1000);
  const approvalId = uid('APV');
  const r = await rpc('decide_case', { case_id: String(a.case_id), decision, note, cycle_no: String(a.cycle_no), level: a.level || '', role: s!.role,
    account_id: s!.account_id, name: s!.name, item_ids: Array.isArray(a.item_ids) ? a.item_ids : [], approval_id: approvalId, now_str: ts() });
  const [c] = await selectAll('repair_case', (q) => q.eq('case_id', String(a.case_id)));
  try { await audit(s, 'APPROVAL_' + decision, 'REPAIR_CASE', c.case_id, r.before, { status: r.status, cycle_no: r.cycle_no, level: r.level }, note); } catch (e) { console.error('audit APPROVAL: ' + e); }
  const vars = caseVars(c, { approver: s!.name, catatan: note || '-', status: r.level });
  if (r.ev === 'HEAD') await safeNotify('HEAD', 'HEAD-' + c.case_id + '-' + r.cycle_no, vars);
  if (r.ev === 'DONE') await safeNotify('DONE', 'DONE-' + c.case_id, vars);
  if (r.ev === 'REJECT') await safeNotify('REJECT', 'REJ-' + approvalId, { ...vars, daftar: r.reopen.map((i: Record<string, string>) => '- ' + i.point_name_snapshot + ' [' + i.department + ']').join('\n') });
  return { status: r.status };
};

export const APPROVAL_ROUTES = { approvalQueue, decide };
