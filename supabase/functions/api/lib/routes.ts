import { AUTH_ROUTES, resolve } from './auth.ts';
import { selectAll } from './db.ts';
import { APPROVAL_ROUTES } from './approval.ts';
import { MONITORING_ROUTES } from './monitoring.ts';
import { MASTER_ROUTES } from './master.ts';
import { NOTIFY_ROUTES } from './notify.ts';
import { BACKUP_ROUTES } from './backup.ts';
import { cronBackup, cronHourly, cronReminder } from './cron.ts';
import { photo } from './photos.ts';
import { REPAIR_ROUTES } from './repair.ts';
import { isMasterReady, SCHEDULE_ROUTES } from './schedule.ts';
import type { ApiResult, RouteFn, Session } from './types.ts';
import { ALL, err, fail, GUEST, LOGGED, UserError } from './util.ts';

const todo: RouteFn = () => Promise.reject(err('Belum tersedia', 'NOT_FOUND'));
const r = (roles: string[] | null, fn: RouteFn = todo) => ({ roles, fn });

const publicInfo: RouteFn = async () => {
  const persons: Record<string, { id: string; name: string }[]> = { PIC: [], MAINTENANCE: [], UTILITY: [] };
  (await selectAll<{ person_id: string; display_name: string; role_type: string; active: string }>('master_person'))
    .filter((p) => p.active === 'TRUE')
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .forEach((p) => persons[p.role_type]?.push({ id: p.person_id, name: p.display_name }));
  return { installed: true, ready: await isMasterReady(), persons };
};

// Modul task berikutnya mengganti `fn` entri di sini (mis. ROUTES.login.fn = ...).
export const ROUTES: Record<string, { roles: string[] | null; fn: RouteFn }> = {
  publicInfo: r(null, publicInfo),
  login: r(null, AUTH_ROUTES.login), guestLogin: r(null, AUTH_ROUTES.guestLogin), logout: r(ALL, AUTH_ROUTES.logout),
  // Checklist
  worklist: r(['PIC', 'UTILITY'], SCHEDULE_ROUTES.worklist), checklistForm: r(['PIC', 'UTILITY'], SCHEDULE_ROUTES.checklistForm),
  submitChecklist: r(['PIC', 'UTILITY'], SCHEDULE_ROUTES.submitChecklist),
  todaySchedules: r(LOGGED, SCHEDULE_ROUTES.todaySchedules), checklistDetail: r(LOGGED, SCHEDULE_ROUTES.checklistDetail),
  // Perbaikan
  repairQueue: r(ALL, REPAIR_ROUTES.repairQueue), claimItem: r(GUEST, REPAIR_ROUTES.claimItem), completeItem: r(GUEST, REPAIR_ROUTES.completeItem),
  releaseItem: r(['ADMIN', 'SPV'], REPAIR_ROUTES.releaseItem), caseDetail: r(ALL, REPAIR_ROUTES.caseDetail), caseList: r(LOGGED, REPAIR_ROUTES.caseList), photo: r(ALL, photo),
  // Approval
  approvalQueue: r(LOGGED, APPROVAL_ROUTES.approvalQueue), decide: r(LOGGED, APPROVAL_ROUTES.decide),
  // Monitoring
  dashboard: r(LOGGED, MONITORING_ROUTES.dashboard), kanban: r(LOGGED, MONITORING_ROUTES.kanban), report: r(LOGGED, MONITORING_ROUTES.report),
  exportReport: r(LOGGED, MONITORING_ROUTES.exportReport), lookups: r(LOGGED, MONITORING_ROUTES.lookups), changePassword: r(LOGGED, AUTH_ROUTES.changePassword),
  // Admin
  masterData: r(['ADMIN'], MASTER_ROUTES.masterData), saveAsset: r(['ADMIN'], MASTER_ROUTES.saveAsset), saveMapping: r(['ADMIN'], MASTER_ROUTES.saveMapping), savePerson: r(['ADMIN'], MASTER_ROUTES.savePerson), saveAccount: r(['ADMIN'], MASTER_ROUTES.saveAccount),
  resetPassword: r(['ADMIN'], MASTER_ROUTES.resetPassword), auditLog: r(['ADMIN'], MASTER_ROUTES.auditLog), settings: r(['ADMIN'], NOTIFY_ROUTES.settings), saveSettings: r(['ADMIN'], NOTIFY_ROUTES.saveSettings), saveFonnteToken: r(['ADMIN'], NOTIFY_ROUTES.saveFonnteToken),
  testFonnte: r(['ADMIN'], NOTIFY_ROUTES.testFonnte), notifLog: r(['ADMIN'], NOTIFY_ROUTES.notifLog), retryNotif: r(['ADMIN'], NOTIFY_ROUTES.retryNotif), backupNow: r(['ADMIN'], BACKUP_ROUTES.backupNow), backupLog: r(['ADMIN'], BACKUP_ROUTES.backupLog),
};

/** Fungsi cron, dipanggil index.ts dengan token 'CRON' + header x-cron-secret. */
export const CRON: Record<string, () => Promise<unknown>> = { cronHourly, cronBackup, cronReminder };

// deno-lint-ignore no-explicit-any
export async function api(token: string | null, action: string, args: Record<string, any> | null): Promise<ApiResult> {
  try {
    const rt = Object.hasOwn(ROUTES, action) ? ROUTES[action] : null;
    if (!rt) return fail('Aksi tidak dikenal', 'NOT_FOUND');
    let s: Session | null = null;
    if (rt.roles) {
      s = token ? await resolve(token) : null;
      if (!s) return fail('Sesi berakhir, silakan masuk lagi', 'AUTH');
      if (!rt.roles.includes(s.role)) return fail('Akses ditolak untuk role ' + s.role, 'FORBIDDEN');
    }
    return { success: true, data: await rt.fn(s, args || {}, token || ''), message: '', code: 'OK' };
  } catch (e) {
    if (e instanceof UserError) return fail(e.message, e.code);
    console.error('api ' + action + ': ' + ((e as Error)?.stack || e));
    return fail('Terjadi kesalahan sistem. Coba lagi atau hubungi Admin.', 'ERROR');
  }
}
