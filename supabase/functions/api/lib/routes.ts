import { AUTH_ROUTES, resolve } from './auth.ts';
import { selectAll } from './db.ts';
import type { ApiResult, RouteFn, Session } from './types.ts';
import { ALL, DEPTS, err, fail, GUEST, LOGGED, UserError } from './util.ts';

const todo: RouteFn = () => Promise.reject(err('Belum tersedia', 'NOT_FOUND'));
const r = (roles: string[] | null, fn: RouteFn = todo) => ({ roles, fn });

export async function isMasterReady() {
  const aset = new Set((await selectAll<{ asset_id: string; active: string }>('master_asset')).filter((a) => a.active === 'TRUE').map((a) => a.asset_id));
  const cps = (await selectAll<{ asset_id: string; active: string; repair_department: string }>('master_checkpoint')).filter((c) => c.active === 'TRUE' && aset.has(c.asset_id));
  const unmapped = cps.filter((c) => !DEPTS.includes(c.repair_department)).length;
  return { ok: cps.length > 0 && unmapped === 0, unmapped, total: cps.length };
}

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
  worklist: r(['PIC', 'UTILITY']), checklistForm: r(['PIC', 'UTILITY']), submitChecklist: r(['PIC', 'UTILITY']),
  todaySchedules: r(LOGGED), checklistDetail: r(LOGGED),
  // Perbaikan
  repairQueue: r(ALL), claimItem: r(GUEST), completeItem: r(GUEST), releaseItem: r(['ADMIN', 'SPV']),
  caseDetail: r(ALL), caseList: r(LOGGED), photo: r(ALL),
  // Approval
  approvalQueue: r(LOGGED), decide: r(LOGGED),
  // Monitoring
  dashboard: r(LOGGED), kanban: r(LOGGED), report: r(LOGGED), exportReport: r(LOGGED), lookups: r(LOGGED), changePassword: r(LOGGED, AUTH_ROUTES.changePassword),
  // Admin
  masterData: r(['ADMIN']), saveAsset: r(['ADMIN']), saveMapping: r(['ADMIN']), savePerson: r(['ADMIN']), saveAccount: r(['ADMIN']),
  resetPassword: r(['ADMIN']), auditLog: r(['ADMIN']), settings: r(['ADMIN']), saveSettings: r(['ADMIN']), saveFonnteToken: r(['ADMIN']),
  testFonnte: r(['ADMIN']), notifLog: r(['ADMIN']), retryNotif: r(['ADMIN']), backupNow: r(['ADMIN']), backupLog: r(['ADMIN']),
};

/** Fungsi cron (Task 8) didaftarkan di sini: CRON.nama = async () => ... */
export const CRON: Record<string, () => Promise<unknown>> = {};

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
