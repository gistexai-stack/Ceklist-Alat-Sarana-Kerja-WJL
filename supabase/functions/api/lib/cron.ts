import { backup } from './backup.ts';
import { selectAll } from './db.ts';
import { appUrl, notify, NOTIFY_ROUTES } from './notify.ts';
import { ensureSchedules, markMissed } from './schedule.ts';
import { hoursBetween, opDate, ts } from './util.ts';

export async function cronHourly(): Promise<void> {
  await ensureSchedules(true);
  await markMissed();
  try { await NOTIFY_ROUTES.retryNotif(null, {}, ''); } catch (e) { console.error(e); }
}

export async function cronBackup(): Promise<void> { await backup('AUTO', null); }

export async function cronReminder(): Promise<void> {
  const cases = (await selectAll('repair_case', (q) => q.in('status', ['PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI'])))
    .sort((a, b) => a.first_finding_at.localeCompare(b.first_finding_at));
  if (!cases.length) return;
  const now = ts();
  const items = await selectAll('repair_item', (q) => q.in('case_id', cases.slice(0, 25).map((c) => c.case_id)).neq('status', 'DONE'));
  const daftar = cases.slice(0, 25).map((c) => {
    const its = items.filter((i) => i.case_id === c.case_id);
    return '- ' + c.case_id + ' ' + c.asset_name_snapshot + ' (' + Math.round(Number(hoursBetween(c.first_finding_at, now))) + ' jam, ' + its.length + ' item: '
      + [...new Set(its.map((i) => i.department))].join('/') + ')';
  }).join('\n') + (cases.length > 25 ? '\n… dan ' + (cases.length - 25) + ' kasus lain' : '');
  await notify('REMINDER', 'REM-' + opDate(new Date()), { waktu: now.slice(0, 16), daftar, link: appUrl() || '-' });
}
